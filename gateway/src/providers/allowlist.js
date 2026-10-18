// Proxy allow-list built from packages/core/peppol/providers.json, never
// kept by hand: a provider is proxied only when the file (or the
// PROVIDER_BASE_URLS override in .env) gives it a base URL. The one
// exception is a provider with customBaseUrl ("sapi-sk", any SAPI-SK
// provider): its base URL comes in the X-Upstream-Base header and passes
// the same SSRF checks. "<id>-sandbox" selects the sandbox address.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HttpError } from '../lib/errors.js';

// The repository checkout first, then a copy placed next to this module
// (the Docker image copies the file there).
const CANDIDATES = ['../../../packages/core/peppol/providers.json', './providers.json'];

export function resolveProvidersFile(explicit) {
  if (explicit) return explicit;
  for (const rel of CANDIDATES) {
    const path = fileURLToPath(new URL(rel, import.meta.url));
    if (existsSync(path)) return path;
  }
  throw new Error('providers.json not found; set PROVIDERS_FILE');
}

export function loadProviders(file) {
  const data = JSON.parse(readFileSync(resolveProvidersFile(file), 'utf8'));
  if (!data || !Array.isArray(data.providers)) throw new Error('providers.json has no providers array');
  return data.providers;
}

// Map providerId to {provider, prod, sandbox, custom}; only entries with
// an address (or customBaseUrl) can be proxied.
export function buildAllowlist(providers, overrides = {}) {
  const map = new Map();
  for (const p of providers) {
    if (!p || typeof p.id !== 'string') continue;
    const prod = overrides[p.id] || (p.baseUrl && p.baseUrl.prod) || null;
    const sandbox = overrides[`${p.id}-sandbox`] || (p.baseUrl && p.baseUrl.sandbox) || null;
    map.set(p.id, { provider: p, prod, sandbox, custom: p.customBaseUrl === true });
  }
  return map;
}

function parseBase(text, code = 'PROVIDER_NOT_CONFIGURED') {
  let url;
  try {
    url = new URL(text);
  } catch (e) {
    throw new HttpError(400, code, 'Upstream base URL is not valid');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new HttpError(400, 'HOST_NOT_ALLOWED', 'Upstream base URL must be https without credentials or query');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url;
}

// Returns {provider, base (URL), custom} for a providerId and the request
// headers, or throws the public error.
export function resolveUpstreamBase(providerId, headers, allowlist) {
  const sandbox = providerId.endsWith('-sandbox');
  const id = sandbox ? providerId.slice(0, -'-sandbox'.length) : providerId;
  const entry = allowlist.get(id);
  if (!entry) throw new HttpError(400, 'HOST_NOT_ALLOWED', 'Unknown provider');
  if (entry.custom) {
    const custom = headers['x-upstream-base'];
    if (!custom) throw new HttpError(400, 'BAD_REQUEST', 'X-Upstream-Base header is required for this provider');
    return { provider: entry.provider, base: parseBase(String(custom), 'BAD_REQUEST'), custom: true };
  }
  const text = sandbox ? entry.sandbox : entry.prod;
  if (!text) throw new HttpError(400, 'PROVIDER_NOT_CONFIGURED', 'Provider API address is not configured yet');
  return { provider: entry.provider, base: parseBase(text), custom: false };
}

export function createAllowlist(config) {
  return buildAllowlist(loadProviders(config.proxy.providersFile), config.proxy.baseUrls);
}
