import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

function getKey(value = env.contactEncryptionKey) {
  if (!value || !/^[a-fA-F0-9]{64}$/.test(value)) {
    const error = new Error('Private contact encryption is not configured');
    error.code = 'CONTACT_ENCRYPTION_UNAVAILABLE';
    throw error;
  }
  return Buffer.from(value, 'hex');
}

export function encryptPrivateContact(value, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(key), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag() };
}

export function decryptPrivateContact(record, key) {
  const decipher = createDecipheriv('aes-256-gcm', getKey(key), record.iv);
  decipher.setAuthTag(record.authTag);
  return Buffer.concat([decipher.update(record.ciphertext), decipher.final()]).toString('utf8');
}
