// The backup file: the core's JSON, optionally sealed with a password.
// The sealing uses the sync package's crypto unchanged: a key derived from
// the password with PBKDF2-SHA256 (salt and iteration count stored in the
// file) and AES-GCM 256, which also detects any changed byte. A wrong
// password and a damaged file look the same to AES-GCM, and the user is
// told exactly that.
import { CoreError } from '@we-invoice/core';
import { deriveKek, seal, open, randomBytes, toBase64, fromBase64, ITERATIONS, KDF, MIN_PASSWORD } from '../../sync/crypto.js';
import { buildBackup, serializeBackup, parseBackup } from './core-bridge.js';

export const ENCRYPTED_FORMAT = 'we-invoice-backup-encrypted';
const AAD = new TextEncoder().encode(ENCRYPTED_FORMAT);

export { MIN_PASSWORD };

/** The text of a backup file of the open company's data. */
export async function backupText(data, { password = null, now = new Date().toISOString(), iterations = ITERATIONS } = {}) {
  const plain = serializeBackup(buildBackup(data, { now }));
  if (!password) return plain;
  if (password.length < MIN_PASSWORD) throw new CoreError('BACKUP_PASSWORD_SHORT', 'password too short');
  const salt = randomBytes(16);
  const key = await deriveKek(password, salt, iterations);
  const sealed = await seal(key, new TextEncoder().encode(plain), AAD);
  return `${JSON.stringify({ format: ENCRYPTED_FORMAT, version: 1, kdf: KDF, iterations, salt: toBase64(salt), data: toBase64(sealed), createdAt: now })}\n`;
}

/** Whether a file's text is a sealed backup (then it needs the password). */
export function isEncryptedBackup(text) {
  try {
    const value = JSON.parse(text);
    return Boolean(value) && value.format === ENCRYPTED_FORMAT;
  } catch {
    return false;
  }
}

/** Reads a backup file into the core's checked envelope. */
export async function readBackup(text, password = null) {
  if (!isEncryptedBackup(text)) return parseBackup(text);
  const envelope = JSON.parse(text);
  if (!password) throw new CoreError('BACKUP_PASSWORD_REQUIRED', 'the backup is encrypted');
  if (envelope.kdf !== KDF || !Number.isInteger(envelope.iterations) || typeof envelope.salt !== 'string' || typeof envelope.data !== 'string') {
    throw new CoreError('BACKUP_DAMAGED', 'the encryption header is not readable');
  }
  let plain;
  try {
    const key = await deriveKek(password, fromBase64(envelope.salt), envelope.iterations);
    plain = await open(key, fromBase64(envelope.data), AAD);
  } catch (e) {
    console.warn('Backup could not be opened', e);
    throw new CoreError('BACKUP_PASSWORD_WRONG', 'wrong password or damaged file');
  }
  return parseBackup(new TextDecoder().decode(plain));
}
