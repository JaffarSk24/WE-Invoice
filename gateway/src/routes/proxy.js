// ANY /v1/proxy/peppol/{providerId}/{path*}: streams a request to a Peppol
// provider from the allow-list and streams the answer back. The body is
// never buffered or stored, the path and query never logged. The header
// X-Upstream-Authorization becomes Authorization upstream.
import { Transform } from 'node:stream';
import { request as undiciRequest } from 'undici';
import { HttpError, upstreamUnavailable } from '../lib/errors.js';
import { resolvePublicHost, assertSameOrigin } from '../lib/ssrf.js';
import { createAllowlist, resolveUpstreamBase } from '../providers/allowlist.js';

const FORWARD_REQUEST = ['content-type', 'accept', 'content-length', 'x-peppol-participant-id', 'x-api-key', 'accept-language', 'if-none-match'];
// Never cache-control or set-cookie: provider answers carry API tokens and
// must not be cached anywhere, so the gateway always answers no-store.
const FORWARD_RESPONSE = ['content-type', 'content-length', 'content-disposition', 'etag', 'location', 'x-request-id', 'retry-after'];
const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

export function upstreamHeaders(headers) {
  const out = { 'user-agent': 'WE-Invoice-gateway' };
  for (const name of FORWARD_REQUEST) if (headers[name] !== undefined) out[name] = headers[name];
  if (headers['x-upstream-authorization']) out.authorization = headers['x-upstream-authorization'];
  return out;
}

// Rest of the path after the providerId, taken from the raw URL so the
// client's percent-encoding reaches the provider unchanged.
export function upstreamPath(rawUrl, providerId) {
  const prefix = `/v1/proxy/peppol/${providerId}/`;
  const rest = rawUrl.slice(rawUrl.indexOf(prefix) + prefix.length);
  const path = rest.split('?')[0];
  if (path.split('/').some(seg => seg === '..' || seg === '.' || seg === '%2e%2e' || seg === '%2E%2E') || /^\/|\\|\/\//.test(path)) {
    throw new HttpError(400, 'BAD_REQUEST', 'Invalid upstream path');
  }
  return rest;
}

// Counts bytes and fails the stream once the limit is passed.
export function limitStream(maxBytes) {
  let seen = 0;
  return new Transform({
    transform(chunk, encoding, callback) {
      seen += chunk.length;
      if (seen > maxBytes) {
        const err = new HttpError(413, 'BODY_TOO_LARGE', 'Body too large');
        return callback(err);
      }
      callback(null, chunk);
    }
  });
}

export default async function proxyRoutes(app, { config, dispatcher, lookup, allowlist = createAllowlist(config) }) {
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', (request, payload, done) => done(null, payload));

  app.route({
    method: METHODS,
    url: '/v1/proxy/peppol/:providerId/*',
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: { params: { type: 'object', properties: { providerId: { type: 'string', pattern: '^[a-z0-9-]{2,40}$' } } } },
    handler: async (request, reply) => {
      const length = Number(request.headers['content-length'] || 0);
      if (length > config.proxy.maxBodyBytes) throw new HttpError(413, 'BODY_TOO_LARGE', 'Body too large');
      const { base } = resolveUpstreamBase(request.params.providerId, request.headers, allowlist);
      await resolvePublicHost(base.hostname, lookup);
      const prefix = base.pathname === '/' ? '' : base.pathname;
      const url = `${base.origin}${prefix}/${upstreamPath(request.raw.url, request.params.providerId)}`;
      const hasBody = !['GET', 'DELETE'].includes(request.method) && request.body;
      const body = hasBody ? request.body.pipe(limitStream(config.proxy.maxBodyBytes)) : undefined;
      const response = await forward(url, request.method, upstreamHeaders(request.headers), body, { dispatcher, config, lookup });
      reply.code(response.statusCode);
      for (const name of FORWARD_RESPONSE) if (response.headers[name] !== undefined) reply.header(name, response.headers[name]);
      reply.header('cache-control', 'no-store');
      reply.header('pragma', 'no-cache');
      return reply.send(response.body);
    }
  });
}

async function forward(url, method, headers, body, { dispatcher, config, lookup }, hops = 0) {
  let response;
  try {
    response = await undiciRequest(url, { method, headers, body, dispatcher, headersTimeout: config.upstream.timeoutMs, bodyTimeout: config.upstream.timeoutMs * 4 });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw upstreamUnavailable('Provider unavailable');
  }
  if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
    await response.body.dump();
    const next = assertSameOrigin(url, String(response.headers.location));
    if (method !== 'GET' || hops >= 3) throw upstreamUnavailable('Provider redirect refused');
    await resolvePublicHost(next.hostname, lookup);
    return forward(next.href, method, headers, undefined, { dispatcher, config, lookup }, hops + 1);
  }
  return response;
}
