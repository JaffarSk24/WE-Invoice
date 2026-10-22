// Register lookups: Slovak company (RPO + FS open data), Slovak search,
// Czech company (ARES), VIES and the Slovak VAT payer lists. Every answer
// is public data and is cached for 24 hours.
import { DAY } from '../lib/cache.js';
import { notFound } from '../lib/errors.js';
import { fetchCompanySk, searchCompaniesSk } from '../upstream/rpo.js';
import { fetchVatIds, fetchReliability } from '../upstream/fs-opendata.js';
import { fetchCompanyCz } from '../upstream/ares.js';
import { checkVat } from '../upstream/vies.js';

const FS_RETRY_MS = 5 * 60 * 1000;
const limit = (max) => ({ rateLimit: { max, timeWindow: '1 minute' } });
const params = (properties) => ({ type: 'object', properties, required: Object.keys(properties) });

export default async function registerRoutes(app, { config, upstream, cache }) {
  const u = config.upstream;

  app.get('/v1/company/sk/search', {
    config: limit(30),
    schema: { querystring: params({ q: { type: 'string', minLength: 3, maxLength: 100 } }) }
  }, async (request) => {
    const q = request.query.q.trim();
    const results = await cache.remember(`company:sk:search:${q.toLowerCase()}`, DAY, () => searchCompaniesSk(upstream, u, q));
    return { results };
  });

  app.get('/v1/company/sk/:ico', {
    config: limit(30),
    schema: { params: params({ ico: { type: 'string', pattern: '^[0-9]{6,8}$' } }) }
  }, async (request) => {
    const { ico } = request.params;
    // An answer without DIČ because the FS open data failed is kept for a
    // few minutes only, so the company gets its DIČ once FS is back.
    let fsFailed = false;
    const company = await cache.remember(`company:sk:${ico}`, () => (fsFailed ? FS_RETRY_MS : DAY), async () => {
      const found = await fetchCompanySk(upstream, u, ico);
      if (!found) return null;
      let ids = { dic: null, icDph: null };
      try {
        ids = await fetchVatIds(upstream, u, ico);
      } catch (e) {
        fsFailed = true;
        request.log.warn({ reason: e.code || e.message }, 'FS open data lookup skipped');
      }
      return { ...found, dic: ids.dic, icDph: ids.icDph };
    });
    if (!company) throw notFound('Company not found');
    return company;
  });

  app.get('/v1/company/cz/:ico', {
    config: limit(30),
    schema: { params: params({ ico: { type: 'string', pattern: '^[0-9]{8}$' } }) }
  }, async (request) => {
    const { ico } = request.params;
    const company = await cache.remember(`company:cz:${ico}`, DAY, async () => {
      try {
        return await fetchCompanyCz(upstream, u, ico);
      } catch (e) {
        if (e.statusCode === 404) return null;
        throw e;
      }
    });
    if (!company) throw notFound('Company not found');
    return company;
  });

  app.get('/v1/vat/vies/:cc/:number', {
    config: limit(30),
    schema: { params: params({ cc: { type: 'string', pattern: '^[A-Z]{2}$' }, number: { type: 'string', pattern: '^[0-9A-Z+*]{2,13}$' } }) }
  }, async (request) => {
    const { cc, number } = request.params;
    return cache.remember(`vies:${cc}${number}`, DAY, () => checkVat(upstream, u, cc, number));
  });

  app.get('/v1/vat/sk/:icdph/reliability', {
    config: limit(30),
    schema: { params: params({ icdph: { type: 'string', pattern: '^SK[0-9]{10}$' } }) }
  }, async (request) => {
    const { icdph } = request.params;
    return cache.remember(`reliability:${icdph}`, DAY, () => fetchReliability(upstream, u, icdph));
  });
}
