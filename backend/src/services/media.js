import { createHash, randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pool } from '../database/pool.js';
import { env } from '../config/env.js';
import { RequestError } from '../http/validation.js';

const MIME_EXTENSIONS = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
});

export function sniffMime(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buffer.length >= 5 && buffer.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

export function createMediaService(db = pool, storageDir = env.mediaStorageDir) {
  return {
    async save(file, actorUserId, { rightsConfirmed = false, rightsNote = null, altText = null, imagesOnly = false } = {}) {
      if (!file || !Buffer.isBuffer(file.buffer) || file.size < 1 || file.size > 10 * 1024 * 1024) {
        throw new RequestError(400, 'INVALID_UPLOAD', 'File must be between 1 byte and 10 MB');
      }
      const detectedMime = sniffMime(file.buffer);
      if (!detectedMime || !MIME_EXTENSIONS[detectedMime] || detectedMime !== file.mimetype ||
          (imagesOnly && !detectedMime.startsWith('image/'))) {
        throw new RequestError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Only valid JPEG, PNG, WebP images and PDF documents are accepted');
      }
      const extension = MIME_EXTENSIONS[detectedMime];
      const storageKey = randomUUID() + '.' + extension;
      await mkdir(storageDir, { recursive: true, mode: 0o700 });
      const path = join(storageDir, storageKey);
      await writeFile(path, file.buffer, { flag: 'wx', mode: 0o600 });
      const checksum = createHash('sha256').update(file.buffer).digest('hex');
      const filename = String(file.originalname || 'upload.' + extension).replace(/[\/\\\u0000-\u001f\u007f]/g, '_').slice(0, 180);
      try {
        const result = await db.query(
          'INSERT INTO conspace.media_assets ' +
          '(storage_key,original_filename,mime_type,size_bytes,sha256,category,alt_text,uploaded_by_user_id,rights_confirmed,rights_note) ' +
          'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ' +
          'RETURNING id,original_filename AS "originalFilename",mime_type AS "mimeType",size_bytes AS "sizeBytes",category,alt_text AS "altText",rights_confirmed AS "rightsConfirmed",created_at AS "createdAt"',
          [storageKey, filename, detectedMime, file.size, checksum,
            detectedMime.startsWith('image/') ? 'IMAGE' : 'DOCUMENT',
            altText, actorUserId, rightsConfirmed, rightsNote]
        );
        return result.rows[0];
      } catch (error) {
        await unlink(path).catch(() => {});
        throw error;
      }
    },

    async cleanup(ids) {
      if (!ids?.length) return;
      const result = await db.query('SELECT id,storage_key FROM conspace.media_assets WHERE id=ANY($1::uuid[])', [ids]);
      await db.query('UPDATE conspace.media_assets SET deleted_at=now() WHERE id=ANY($1::uuid[])', [ids]);
      for (const row of result.rows) await unlink(join(storageDir,row.storage_key)).catch(() => {});
    },

    async read(id) {
      const result = await db.query(
        'SELECT id,storage_key,mime_type AS "mimeType",original_filename AS "originalFilename" ' +
        'FROM conspace.media_assets WHERE id = $1 AND deleted_at IS NULL',
        [id]
      );
      if (!result.rows[0]) throw new RequestError(404, 'NOT_FOUND', 'Media not found');
      const file = result.rows[0];
      return { ...file, buffer: await readFile(join(storageDir, file.storage_key)) };
    },
  };
}
