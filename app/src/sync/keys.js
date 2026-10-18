// The encryption header of a workspace (the `keys` field of workspace.json,
// also the open part of workspace.json.enc in Drive) and the operations on
// it. The header never holds a secret in the clear:
//
//   {
//     kdf: 'PBKDF2-SHA256', iterations, salt,        parameters of the password KEK
//     wrappedByPassword,                              the DEK sealed by that KEK (base64, iv + ciphertext)
//     recoverySalt, wrappedByRecovery,                the same DEK sealed by the KEK of the 24 recovery words
//     createdAt, passwordChangedAt                    ISO, UTC
//   }
//
// Both wrappings open the same 32-byte DEK. A new password rewraps only
// wrappedByPassword (new salt, new wrapping); the recovery wrapping and
// every file in Drive stay as they are. Whoever has neither the password
// nor the words cannot open anything, and nothing here is sent anywhere.
import {
  ITERATIONS, KDF, MIN_PASSWORD, randomBytes, toBase64, fromBase64, B64, deriveKek, generateDekBits,
  wrapBits, unwrapBits, cryptoError
} from './crypto.js';
import { generateRecoveryWords, validateRecoveryWords, recoverySecret } from './recovery.js';

export const HEADER_VERSION = 1;

export function checkPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) throw cryptoError('WEAK_PASSWORD');
  return password;
}

// Validates a header read from a file or the store. Throws DAMAGED for a
// malformed one and NEWER_FORMAT for a KDF this client does not know.
export function parseHeader(value) {
  if (!value || typeof value !== 'object') throw cryptoError('DAMAGED', 'No encryption header');
  if (value.kdf !== KDF) throw cryptoError('NEWER_FORMAT', `Unknown key derivation ${value.kdf}`);
  const ok = Number.isInteger(value.iterations) && value.iterations >= 1000 && value.iterations <= 100000000
    && [value.salt, value.wrappedByPassword, value.recoverySalt, value.wrappedByRecovery].every(s => typeof s === 'string' && B64.test(s));
  if (!ok) throw cryptoError('DAMAGED', 'Malformed encryption header');
  return value;
}

export function isEncrypted(workspace) {
  return Boolean(workspace && workspace.keys && workspace.keys.wrappedByPassword);
}

async function wrapWith(secret, dekBits, iterations) {
  const salt = randomBytes(16);
  const kek = await deriveKek(secret, salt, iterations);
  return { salt: toBase64(salt), wrapped: await wrapBits(kek, dekBits) };
}

async function unwrapWith(secret, salt, wrapped, iterations, code) {
  const kek = await deriveKek(secret, fromBase64(salt), iterations);
  try {
    return await unwrapBits(kek, wrapped);
  } catch (e) {
    throw cryptoError(code);
  }
}

// Turning encryption on: a fresh DEK wrapped by the password and by a
// fresh recovery phrase. Returns the header, the DEK bits (for the keyring
// of this device) and the words, shown to the user once.
export async function createKeys(password, { iterations = ITERATIONS, words = null, now = new Date().toISOString() } = {}) {
  checkPassword(password);
  const recoveryWords = words || await generateRecoveryWords();
  const dekBits = generateDekBits();
  const byPassword = await wrapWith(password, dekBits, iterations);
  const byRecovery = await wrapWith(recoverySecret(recoveryWords), dekBits, iterations);
  const header = {
    kdf: KDF,
    iterations,
    salt: byPassword.salt,
    wrappedByPassword: byPassword.wrapped,
    recoverySalt: byRecovery.salt,
    wrappedByRecovery: byRecovery.wrapped,
    createdAt: now,
    passwordChangedAt: null
  };
  return { header, dekBits, words: recoveryWords };
}

// The DEK bits from the password, or WRONG_PASSWORD.
export async function unlockWithPassword(header, password) {
  const h = parseHeader(header);
  if (typeof password !== 'string' || !password) throw cryptoError('WRONG_PASSWORD');
  return unwrapWith(password, h.salt, h.wrappedByPassword, h.iterations, 'WRONG_PASSWORD');
}

// The DEK bits from the recovery words (typed text or a list), or
// WRONG_RECOVERY_KEY when the phrase is not a valid key or not this one.
export async function unlockWithRecovery(header, wordsInput) {
  const h = parseHeader(header);
  const words = await validateRecoveryWords(wordsInput);
  if (!words) throw cryptoError('WRONG_RECOVERY_KEY');
  return unwrapWith(recoverySecret(words), h.recoverySalt, h.wrappedByRecovery, h.iterations, 'WRONG_RECOVERY_KEY');
}

// A new password: only the password wrapping changes. The caller proves
// it holds the DEK (from the old password or from the recovery words).
export async function changePassword(header, dekBits, newPassword, { now = new Date().toISOString() } = {}) {
  const h = parseHeader(header);
  checkPassword(newPassword);
  const byPassword = await wrapWith(newPassword, dekBits, h.iterations);
  return { ...h, salt: byPassword.salt, wrappedByPassword: byPassword.wrapped, passwordChangedAt: now };
}

// A new recovery phrase (the old one was lost or shown to someone): only
// the recovery wrapping changes.
export async function rotateRecovery(header, dekBits, { words = null } = {}) {
  const h = parseHeader(header);
  const recoveryWords = words || await generateRecoveryWords();
  const byRecovery = await wrapWith(recoverySecret(recoveryWords), dekBits, h.iterations);
  return { header: { ...h, recoverySalt: byRecovery.salt, wrappedByRecovery: byRecovery.wrapped }, words: recoveryWords };
}
