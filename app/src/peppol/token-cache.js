// Access tokens of the providers (JWT and OAuth2), kept in memory only and
// only until they expire (04-peppol.md § 4.11): never written to the data
// file, to the device storage or to a log. A token is renewed a minute
// before its expiry; a 401 answer drops it so the next call signs in again.

const SAFETY_MS = 60 * 1000;
const tokens = new Map();
const pending = new Map();

/**
 * @param {string} key  provider, environment and client, never the secret itself
 * @param {() => Promise<{token: string, expiresInMs?: number}>} issue
 */
export async function cachedToken(key, issue, now = () => Date.now()) {
  const hit = tokens.get(key);
  if (hit && hit.expiresAt - SAFETY_MS > now()) return hit.token;
  if (pending.has(key)) return pending.get(key);
  const promise = issue().then(({ token, expiresInMs }) => {
    tokens.set(key, { token, expiresAt: now() + (Number.isFinite(expiresInMs) ? expiresInMs : 10 * 60 * 1000) });
    return token;
  }).finally(() => pending.delete(key));
  pending.set(key, promise);
  return promise;
}

export function dropToken(key) {
  tokens.delete(key);
}

export function dropAllTokens() {
  tokens.clear();
}
