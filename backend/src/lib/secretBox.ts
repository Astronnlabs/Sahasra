import crypto from 'node:crypto';
import { config } from '../config.js';
import { HttpError } from './http.js';

/**
 * AES-256-GCM encryption for secrets stored in the database (VAAHAK connection keys).
 * Stored as "v1.<iv>.<tag>.<ciphertext>" (base64url parts).
 */
function key() {
  const raw = config.TOKEN_ENCRYPTION_KEY ? Buffer.from(config.TOKEN_ENCRYPTION_KEY, 'base64') : null;
  if (!raw || raw.length !== 32) throw new HttpError(503, 'E-billing is not set up on the server yet (TOKEN_ENCRYPTION_KEY is missing). Please contact Sahasra support.');
  return raw;
}

export const secretBoxReady = () => {
  try {
    key();
    return true;
  } catch {
    return false;
  }
};

export function seal(plain: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

export function open(sealed: string) {
  const [v, iv, tag, data] = sealed.split('.');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Unreadable secret');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
