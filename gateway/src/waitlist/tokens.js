// Tokens of the waitlist and the beta: random opaque tokens for e-mail
// links, HMAC-signed tokens for the beta (one year), invite codes for the
// owner's script. Comparisons are constant-time.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

// Invite code: 12 characters without ambiguous letters, grouped by four.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function inviteCode() {
  const bytes = randomBytes(12);
  const chars = Array.from(bytes, b => CODE_ALPHABET[b % CODE_ALPHABET.length]);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8).join('')}`;
}

export const normalizeCode = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(.{4})(.{4})(.{4})$/, '$1-$2-$3');

export function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

const sign = (secret, payload) => createHmac('sha256', secret).update(payload).digest('base64url');

export function signBetaToken(secret, { code, expiresAt }) {
  const payload = Buffer.from(JSON.stringify({ v: 1, code, exp: expiresAt })).toString('base64url');
  return `${payload}.${sign(secret, payload)}`;
}

export function verifyBetaToken(secret, token, now = Date.now()) {
  if (!secret || typeof token !== 'string') return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra !== undefined || !safeEqual(signature, sign(secret, payload))) return null;
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch (e) {
    return null;
  }
  if (!data || data.v !== 1 || typeof data.exp !== 'string' || Date.parse(data.exp) <= now) return null;
  return data;
}
