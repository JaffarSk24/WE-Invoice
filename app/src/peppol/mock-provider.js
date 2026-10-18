// An in-memory Peppol provider for tests: speaks SAPI-SK (auth/token,
// document/send, document/receive, acknowledge) and records every request,
// behind a transport of the shape of app/src/transport. Used by the unit
// tests of this module; never imported by the app itself.

function response(status, body, headers = {}) {
  const text = body === undefined || body === null ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  return {
    status, ok: status >= 200 && status < 300,
    headers: { 'content-type': typeof body === 'string' ? 'application/xml' : 'application/json', ...headers },
    text: async () => text, json: async () => JSON.parse(text), bytes: async () => new TextEncoder().encode(text)
  };
}

/** A SAPI-SK provider. `inbox` holds {id, xml, senderParticipantId}; `sent` collects send bodies. */
export function createSapiProvider({ clientId = 'client', clientSecret = 'secret', inbox = [] } = {}) {
  const state = { inbox: [...inbox], sent: [], acked: [], tokens: 0, fail: null, requests: [] };
  function handle({ method, path, headers, body }) {
    state.requests.push({ method, path, headers });
    if (state.fail) {
      const f = state.fail;
      if (f.times !== undefined && --f.times <= 0) state.fail = null;
      return response(f.status, f.body || { error: { code: 'X', message: 'failure' } });
    }
    if (method === 'POST' && path === 'auth/token') {
      const b = JSON.parse(body);
      if (b.client_id !== clientId || b.client_secret !== clientSecret) return response(401, { error: { code: 'INVALID_CLIENT', message: 'bad credentials' } });
      state.tokens++;
      return response(200, { access_token: `jwt-${state.tokens}`, expires_in: 900, token_type: 'Bearer' });
    }
    if (!String(headers.authorization || headers['x-upstream-authorization'] || '').startsWith('Bearer jwt-')) return response(401, { error: { code: 'UNAUTHORIZED' } });
    if (method === 'POST' && path === 'document/send') {
      const b = JSON.parse(body);
      const key = headers['idempotency-key'];
      const earlier = key && state.sent.find(s => s.key === key);
      if (earlier) return response(200, { documentId: earlier.id, status: 'ACCEPTED' });
      const id = `prov-${state.sent.length + 1}`;
      state.sent.push({ id, key, body: b, participant: headers['x-peppol-participant-id'] });
      return response(202, { documentId: id, status: 'ACCEPTED' });
    }
    if (method === 'GET' && path.startsWith('document/receive?')) {
      const docs = state.inbox.filter(d => !state.acked.includes(d.id));
      return response(200, { documents: docs.map(d => ({ documentId: d.id, senderParticipantId: d.senderParticipantId || '0245:2020000004', status: 'RECEIVED' })), nextPageToken: null });
    }
    const one = /^document\/receive\/([^/]+)(\/acknowledge)?$/.exec(path);
    if (one) {
      const doc = state.inbox.find(d => d.id === decodeURIComponent(one[1]));
      if (!doc) return response(404, { error: { code: 'NOT_FOUND' } });
      if (one[2] && method === 'POST') {
        state.acked.push(doc.id);
        return response(200, { documentId: doc.id, status: 'ACKNOWLEDGED' });
      }
      return response(200, { documentId: doc.id, metadata: {}, payload: doc.xml, payloadFormat: 'XML' });
    }
    return response(404, { error: { code: 'NOT_FOUND', message: path } });
  }
  return { state, handle };
}

/**
 * A transport whose http() reaches the given provider handlers: through
 * the gateway proxy on 'web', straight to the base URL on the desktop.
 * @param {{platform?: string, providers: Object<string, {handle: Function}>, bases?: Object<string, string>, gateway?: Function}} options
 */
export function createMockTransport({ platform = 'web', providers = {}, bases = {}, gateway = null } = {}) {
  const secrets = new Map();
  const calls = [];
  return {
    platform,
    calls,
    secretsMap: secrets,
    gatewayUrl: (path) => `https://gw.test${path}`,
    async http({ url, method = 'GET', headers = {}, body = null }) {
      calls.push({ url, method, headers });
      const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
      const proxy = /^https:\/\/gw\.test\/v1\/proxy\/peppol\/([a-z0-9-]+)\/(.*)$/.exec(url);
      if (proxy) {
        const id = proxy[1].replace(/-sandbox$/, '');
        if (!providers[id]) return response(400, { error: { code: 'PROVIDER_NOT_CONFIGURED' } });
        return providers[id].handle({ method, path: proxy[2], headers: lower, body });
      }
      if (url.startsWith('https://gw.test/') && gateway) return gateway({ url, method, headers: lower, body, response });
      for (const [id, base] of Object.entries(bases)) {
        if (url.startsWith(`${base}/`)) return providers[id].handle({ method, path: url.slice(base.length + 1), headers: lower, body });
      }
      throw Object.assign(new Error('offline'), { name: 'TypeError' });
    },
    secrets: {
      get: async (name) => secrets.get(name) ?? null,
      set: async (name, value) => { secrets.set(name, value); return true; },
      delete: async (name) => { secrets.delete(name); return true; }
    },
    notify: () => {}
  };
}

export { response as mockResponse };
