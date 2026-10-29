// What the desktop app may request straight from the main process (weNet):
// only https, only hosts of the Peppol providers (packages/core/peppol/
// providers.json), the registers and the gateway, plus a provider base URL
// the user typed in for "another SAPI-SK provider", once it passed the
// checks below. Everything else is refused before a connection is made.
// Pure: tested without Electron.

// Registers and services the desktop reaches directly, without the gateway
// (04-peppol.md, 06-gateway-server.md). The gateway itself is here for the
// endpoints it alone provides (rates, eKasa receipts, register caches).
const REGISTER_HOSTS = Object.freeze([
  'invoice-api.whiteeagles.sk',
  'api.statistics.sk',
  'ec.europa.eu',
  'www.nbs.sk',
  'nbs.sk',
  'data.ecb.europa.eu',
  'opendata.financnasprava.sk',
  'ekasa.financnasprava.sk',
  'directory.peppol.eu'
]);

const MAX_BODY_BYTES = 15 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 120000;
const MAX_REDIRECTS = 3;
const METHODS = Object.freeze(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
// Headers the page may not set: they belong to the connection.
const DROPPED_HEADERS = Object.freeze(['host', 'connection', 'content-length', 'transfer-encoding', 'upgrade', 'expect', 'te', 'keep-alive']);

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch (e) {
    return null;
  }
}

// Hosts of every provider base URL that is already known (null means not
// confirmed yet and gives nothing).
function providerHosts(providersJson) {
  const hosts = new Set();
  ((providersJson && providersJson.providers) || []).forEach(p => {
    Object.values((p && p.baseUrl) || {}).forEach(url => {
      const host = typeof url === 'string' ? hostOf(url) : null;
      if (host) hosts.add(host);
    });
  });
  return [...hosts];
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function isPrivateIpv4(ip) {
  const m = IPV4.exec(ip);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

// Loopback, link-local, unique-local, unspecified and mapped private IPv4.
function isPrivateIp(ip) {
  const s = String(ip || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (IPV4.test(s)) return isPrivateIpv4(s);
  if (!s.includes(':')) return false;
  if (s === '::' || s === '::1') return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (mapped) return isPrivateIpv4(mapped[1]);
  return /^(fe[89ab]|f[cd])/.test(s);
}

function isIpLiteral(host) {
  return IPV4.test(host) || host.includes(':');
}

// A host the user may add for a custom provider: a public DNS name.
function validateCustomHost(host) {
  const h = String(host || '').trim().toLowerCase().replace(/\.$/, '');
  if (!h || h.length > 253) return { ok: false, code: 'NET_HOST_BLOCKED' };
  if (isIpLiteral(h)) return { ok: false, code: 'NET_HOST_BLOCKED' };
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(h)) return { ok: false, code: 'NET_HOST_BLOCKED' };
  if (h === 'localhost' || /\.(local|localhost|internal|lan|home|test|invalid|example)$/.test(h)) return { ok: false, code: 'NET_HOST_BLOCKED' };
  return { ok: true, host: h };
}

// The policy object: a fixed allowlist plus hosts added for the session.
function createPolicy({ providers = null, extraHosts = [] } = {}) {
  const allowed = new Set([...REGISTER_HOSTS, ...providerHosts(providers), ...extraHosts.map(h => String(h).toLowerCase())]);

  function checkUrl(url) {
    let parsed;
    try {
      parsed = new URL(String(url));
    } catch (e) {
      return { ok: false, code: 'NET_BAD_URL' };
    }
    if (parsed.protocol !== 'https:') return { ok: false, code: 'NET_BAD_URL' };
    if (parsed.username || parsed.password) return { ok: false, code: 'NET_BAD_URL' };
    const host = parsed.hostname.toLowerCase();
    if (isIpLiteral(host) || !allowed.has(host)) return { ok: false, code: 'NET_HOST_BLOCKED', host };
    return { ok: true, host, url: parsed.toString() };
  }

  return {
    checkUrl,
    isAllowedHost: (host) => allowed.has(String(host || '').toLowerCase()),
    hosts: () => [...allowed].sort(),
    allowHost(host) {
      const check = validateCustomHost(host);
      if (check.ok) allowed.add(check.host);
      return check;
    },
    forgetHost(host) {
      const h = String(host || '').toLowerCase();
      if (REGISTER_HOSTS.includes(h) || providerHosts(providers).includes(h)) return false;
      return allowed.delete(h);
    }
  };
}

// Normalises what the page sent: a known method, a bounded timeout, header
// names in lower case without the connection headers.
function normalizeRequest(request) {
  const r = request && typeof request === 'object' ? request : {};
  const method = String(r.method || 'GET').toUpperCase();
  if (!METHODS.includes(method)) return { ok: false, code: 'NET_BAD_URL' };
  const headers = {};
  Object.entries(r.headers || {}).forEach(([name, value]) => {
    const key = String(name).toLowerCase();
    if (!DROPPED_HEADERS.includes(key) && value != null) headers[key] = String(value);
  });
  const timeoutMs = Math.min(MAX_TIMEOUT_MS, Math.max(1000, Number(r.timeoutMs) || DEFAULT_TIMEOUT_MS));
  let body = r.body == null ? null : r.body;
  if (body !== null && typeof body !== 'string' && !(body instanceof Uint8Array)) return { ok: false, code: 'NET_BAD_URL' };
  const size = body === null ? 0 : (typeof body === 'string' ? Buffer.byteLength(body) : body.byteLength);
  if (size > MAX_BODY_BYTES) return { ok: false, code: 'NET_TOO_LARGE' };
  if (method === 'GET' || method === 'HEAD') body = null;
  return { ok: true, method, headers, timeoutMs, body };
}

module.exports = {
  REGISTER_HOSTS, MAX_BODY_BYTES, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS, MAX_REDIRECTS, METHODS,
  hostOf, providerHosts, isPrivateIp, isIpLiteral, validateCustomHost, createPolicy, normalizeRequest
};
