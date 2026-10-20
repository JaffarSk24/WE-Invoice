// GET /v1/proxy/superfaktura/{market}/{path*}: the SuperFaktúra API for
// the import in the web app, whose browser requests the API refuses (it
// sends no CORS headers). Read only: other methods answer 405. The host
// comes only from the market, the path stays under it, and the header
// X-Upstream-Authorization ("SFAPI email=...&apikey=...") becomes
// Authorization upstream. Nothing of the request or the answer is stored
// or logged, and the answer is never cached.
import { HttpError } from '../lib/errors.js';
import { resolvePublicHost } from '../lib/ssrf.js';
import { restAfter, forward } from './proxy.js';
import { SF_MARKETS } from '../upstream/superfaktura-markets.js';

const PREFIX = '/v1/proxy/superfaktura/';
// Paths of the API are like /invoices/index.json/listinfo:1/page:2/per_page:100
// or /invoices/getInvoiceDetails/1,2,3: nothing outside this set is needed,
// and refusing percent-encoding rules out encoded slashes and dots.
const SAFE_PATH = /^[A-Za-z0-9_.:,~-]+(\/[A-Za-z0-9_.:,~-]+)*\/?$/;
const SAFE_QUERY = /^[A-Za-z0-9_.:,~=&+-]*$/;
// Our own rate-limit headers stay; SuperFaktura's Retry-After tells the
// client how long to wait after its 429.
const FORWARD_RESPONSE = ['content-type', 'content-length', 'retry-after'];
const REFUSED_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH'];

export function sfUpstreamUrl(market, rawUrl) {
  if (!Object.hasOwn(SF_MARKETS, market)) throw new HttpError(400, 'HOST_NOT_ALLOWED', 'Unknown SuperFaktura market');
  const rest = restAfter(rawUrl, `${PREFIX}${market}/`);
  const [path, query = ''] = rest.split(/\?(.*)/s);
  if (!SAFE_PATH.test(path) || !SAFE_QUERY.test(query)) throw new HttpError(400, 'BAD_REQUEST', 'Invalid upstream path');
  return `${SF_MARKETS[market]}/${path}${query ? `?${query}` : ''}`;
}

export function sfUpstreamHeaders(headers) {
  const out = { 'user-agent': 'WE-Invoice-gateway', accept: 'application/json' };
  if (headers['x-upstream-authorization']) out.authorization = headers['x-upstream-authorization'];
  return out;
}

export default async function superfakturaRoutes(app, { config, dispatcher, lookup }) {
  app.get(`${PREFIX}:market/*`, {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: { params: { type: 'object', properties: { market: { type: 'string', maxLength: 10 } } } }
  }, async (request, reply) => {
    const url = sfUpstreamUrl(request.params.market, request.raw.url);
    await resolvePublicHost(new URL(url).hostname, lookup);
    const response = await forward(url, 'GET', sfUpstreamHeaders(request.headers), undefined, { dispatcher, config, lookup });
    reply.code(response.statusCode);
    for (const name of FORWARD_RESPONSE) if (response.headers[name] !== undefined) reply.header(name, response.headers[name]);
    reply.header('cache-control', 'no-store');
    reply.header('pragma', 'no-cache');
    return reply.send(response.body);
  });

  // Read only: a write to the user's SuperFaktúra account never passes.
  app.route({
    method: REFUSED_METHODS,
    url: `${PREFIX}:market/*`,
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    handler: async (request, reply) => {
      reply.header('allow', 'GET');
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only GET is allowed');
    }
  });
}
