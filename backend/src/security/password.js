import { randomBytes, scrypt as scryptCallback, timingSafeEqual, scryptSync } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const PARAMETERS = Object.freeze({ N: 32768, r: 8, p: 1, keyLength: 64, maxmem: 64 * 1024 * 1024 });
const DUMMY_SALT = Buffer.from('9e1c6f7b8d2a4c0e9a7b6c5d4e3f2a10', 'hex');
const DUMMY_KEY = scryptSync('not-a-real-conspace-password', DUMMY_SALT, PARAMETERS.keyLength, PARAMETERS);
const DUMMY_HASH = ['scrypt', PARAMETERS.N, PARAMETERS.r, PARAMETERS.p,
  DUMMY_SALT.toString('hex'), DUMMY_KEY.toString('hex')].join('$');

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 14 || password.length > 256) {
    throw new Error('Password must contain between 14 and 256 characters');
  }
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, PARAMETERS.keyLength, PARAMETERS);
  return ['scrypt', PARAMETERS.N, PARAMETERS.r, PARAMETERS.p,
    salt.toString('hex'), Buffer.from(derived).toString('hex')].join('$');
}

export async function verifyPassword(password, encoded) {
  const parts = String(encoded || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    await scrypt(String(password || ''), DUMMY_SALT, PARAMETERS.keyLength, PARAMETERS);
    return false;
  }
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4], 'hex');
  const expected = Buffer.from(parts[5], 'hex');
  if (n !== PARAMETERS.N || r !== PARAMETERS.r || p !== PARAMETERS.p ||
      salt.length !== 16 || expected.length !== PARAMETERS.keyLength) {
    await scrypt(String(password || ''), DUMMY_SALT, PARAMETERS.keyLength, PARAMETERS);
    return false;
  }
  const actual = Buffer.from(await scrypt(String(password || ''), salt, PARAMETERS.keyLength, PARAMETERS));
  return timingSafeEqual(actual, expected);
}

export { DUMMY_HASH };
