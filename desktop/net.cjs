// weNet: HTTP requests made by the main process on behalf of the page, so
// that Peppol providers and registers that do not allow browser (CORS)
// requests are reachable without the gateway. The policy (net-policy.cjs)
// decides which hosts may be called; this module runs the request with a
// timeout, a size limit, and redirects only to hosts the policy allows.
// Errors come back as { error: { code } } so the page can show
// errors.<CODE>; the technical cause is logged here.
const dns = require('dns');
const { createPolicy, normalizeRequest, isPrivateIp, MAX_BODY_BYTES, MAX_REDIRECTS } = require('./net-policy.cjs');

const REDIRECT = [301, 302, 303, 307, 308];

function fail(code, message) {
  return { error: { code, message: message || code } };
}

// Refuses a host that resolves to a private or loopback address (a custom
// provider URL pointing into the local network).
async function assertPublicHost(host, lookup) {
  const records = await lookup(host, { all: true, verbatim: true });
  const list = Array.isArray(records) ? records : [records];
  if (!list.length || list.some(r => isPrivateIp(r.address))) throw Object.assign(new Error(`${host} resolves to a private address`), { code: 'NET_HOST_BLOCKED' });
}

// Reads the body up to the limit; longer bodies are refused, not truncated.
async function readBody(response) {
  if (!response.body) return new Uint8Array(0);
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.byteLength;
    if (total > MAX_BODY_BYTES) throw Object.assign(new Error('response too large'), { code: 'NET_TOO_LARGE' });
    chunks.push(chunk);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

function createNet({ providers = null, extraHosts = [], fetchImpl = (...a) => fetch(...a), lookup = dns.promises.lookup, userAgent = 'WE-Invoice' } = {}) {
  const policy = createPolicy({ providers, extraHosts });

  async function once(url, { method, headers, body, timeoutMs }) {
    return fetchImpl(url, {
      method,
      headers: { 'user-agent': userAgent, ...headers },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs)
    });
  }

  // { status, ok, headers, body: Uint8Array } or { error: { code } }.
  async function request(input) {
    const check = policy.checkUrl(input && input.url);
    if (!check.ok) return fail(check.code, `${check.code} ${check.host || ''}`.trim());
    const norm = normalizeRequest(input);
    if (!norm.ok) return fail(norm.code);
    let url = check.url;
    let options = norm;
    try {
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        await assertPublicHost(new URL(url).hostname, lookup);
        const response = await once(url, options);
        if (!REDIRECT.includes(response.status)) {
          const headers = {};
          response.headers.forEach((value, key) => { headers[key] = value; });
          return { status: response.status, ok: response.ok, headers, body: await readBody(response) };
        }
        const target = response.headers.get('location');
        const next = target ? policy.checkUrl(new URL(target, url).toString()) : { ok: false, code: 'NET_REDIRECT_BLOCKED' };
        if (!next.ok || hop === MAX_REDIRECTS) return fail('NET_REDIRECT_BLOCKED', `redirect to ${target}`);
        url = next.url;
        // A 303 (and a 301/302 after POST, as browsers do) turns into a GET.
        if (response.status === 303 || ((response.status === 301 || response.status === 302) && options.method === 'POST')) {
          options = { ...options, method: 'GET', body: null };
        }
      }
      return fail('NET_REDIRECT_BLOCKED');
    } catch (e) {
      const code = e && e.code === 'NET_HOST_BLOCKED' ? 'NET_HOST_BLOCKED'
        : e && e.code === 'NET_TOO_LARGE' ? 'NET_TOO_LARGE'
          : e && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'NET_TIMEOUT' : 'NET_FAILED';
      console.error('[net]', code, url, e && (e.cause && e.cause.message || e.message));
      return fail(code, e && e.message);
    }
  }

  return {
    request,
    allowHost: (host) => policy.allowHost(host),
    forgetHost: (host) => policy.forgetHost(host),
    hosts: () => policy.hosts()
  };
}

function initNetIpc(ipcMain, net) {
  ipcMain.handle('net:request', (_e, request) => net.request(request));
  ipcMain.handle('net:allow-host', (_e, host) => net.allowHost(host));
  ipcMain.handle('net:forget-host', (_e, host) => net.forgetHost(host));
  ipcMain.handle('net:hosts', () => net.hosts());
}

module.exports = { createNet, initNetIpc, assertPublicHost, readBody };
