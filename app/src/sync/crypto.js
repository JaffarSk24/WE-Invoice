// Encryption primitives over the Web Crypto API (crypto.subtle), the same
// in browsers, in Electron and in Node for the tests. Ported from WE Budget
// and split in two keys (02-architecture.md § 2.5):
//
//   DEK  the data key: random AES-GCM 256, generated once per workspace;
//        every file in Drive is sealed with it
//   KEK  a key-encrypting key derived from a secret (the password, or the
//        recovery phrase) through PBKDF2-SHA256 with a random salt; it only
//        ever wraps the DEK, so a new password rewraps 32 bytes, not every
//        file
//
// AES-GCM authenticates: a changed byte fails to open, so a wrong key and a
// damaged file are both detected (and told apart by keys.js).

// OWASP's figure for PBKDF2-SHA256. Raising it later needs no new format:
// the count is stored in the header next to the salt.
export const ITERATIONS = 600000;
export const MIN_PASSWORD = 8;
export const KDF = 'PBKDF2-SHA256';

function subtle() {
  const c = globalThis.crypto;
  if (!c || !c.subtle) throw cryptoError('CRYPTO_UNAVAILABLE');
  return c.subtle;
}

export function cryptoError(code, message = code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

export function randomBytes(n) {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

export function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return globalThis.btoa(s);
}

export function fromBase64(text) {
  const s = globalThis.atob(String(text));
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

export const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

export function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  parts.forEach(p => { out.set(p, offset); offset += p.length; });
  return out;
}

// ---------- keys ----------

// The raw bits of a KEK from a secret text. Unicode is normalised so the
// same password typed on another keyboard derives the same key.
export async function deriveKekBits(secret, salt, iterations = ITERATIONS) {
  if (typeof secret !== 'string' || !secret) throw cryptoError('EMPTY_SECRET');
  const base = await subtle().importKey('raw', new TextEncoder().encode(secret.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 256);
  return new Uint8Array(bits);
}

export async function deriveKek(secret, salt, iterations = ITERATIONS) {
  return importAesKey(await deriveKekBits(secret, salt, iterations), false);
}

// AES-GCM key from raw bits. The DEK of this device is imported without
// `extractable`, so page script can never read its bytes back out.
export function importAesKey(raw, extractable = false) {
  return subtle().importKey('raw', raw, { name: 'AES-GCM' }, extractable, ['encrypt', 'decrypt']);
}

export function generateDekBits() {
  return randomBytes(32);
}

// ---------- sealing ----------

// iv (12 bytes) followed by the ciphertext with its GCM tag.
export async function seal(key, bytes, aad = null) {
  const iv = randomBytes(12);
  const params = aad ? { name: 'AES-GCM', iv, additionalData: aad } : { name: 'AES-GCM', iv };
  const data = new Uint8Array(await subtle().encrypt(params, key, bytes));
  return concat(iv, data);
}

export async function open(key, sealed, aad = null) {
  if (!(sealed instanceof Uint8Array) || sealed.length < 12 + 16) throw cryptoError('DAMAGED');
  const iv = sealed.subarray(0, 12);
  const params = aad ? { name: 'AES-GCM', iv, additionalData: aad } : { name: 'AES-GCM', iv };
  try {
    return new Uint8Array(await subtle().decrypt(params, key, sealed.subarray(12)));
  } catch (e) {
    throw cryptoError('DAMAGED');
  }
}

// Wrapping the DEK with a KEK: the sealed raw bits as base64.
export async function wrapBits(kek, raw) {
  return toBase64(await seal(kek, raw));
}

export async function unwrapBits(kek, wrapped) {
  if (typeof wrapped !== 'string' || !B64.test(wrapped)) throw cryptoError('DAMAGED');
  return open(kek, fromBase64(wrapped));
}

// Whether two keys are the same without reading them out: both seal the
// same zero block with the same zero IV. The fixed IV is safe here, the
// block is a constant and the result is thrown away.
export async function sameKey(a, b) {
  const block = new Uint8Array(16);
  const iv = new Uint8Array(12);
  const [x, y] = await Promise.all([a, b].map(k => subtle().encrypt({ name: 'AES-GCM', iv }, k, block)));
  return toBase64(new Uint8Array(x)) === toBase64(new Uint8Array(y));
}

export async function sha256(bytes) {
  return new Uint8Array(await subtle().digest('SHA-256', bytes));
}

// A rough hint for the password field: 0 too short, 1 weak, 2 fair, 3 strong.
export function passwordStrength(password) {
  const p = String(password || '');
  if (p.length < MIN_PASSWORD) return 0;
  const kinds = [/\p{Ll}/u, /\p{Lu}/u, /\d/, /[^\p{L}\d]/u].filter(re => re.test(p)).length;
  const unique = new Set(p).size;
  let score = 0;
  if (p.length >= 12) score++;
  if (p.length >= 16) score++;
  if (kinds >= 3) score++;
  if (unique < 5) score = 0;
  return Math.max(1, Math.min(3, score));
}
