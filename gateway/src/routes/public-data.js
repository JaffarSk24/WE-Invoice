// ECB rates, eKasa receipt and the Peppol participant lookup.
import { DAY } from '../lib/cache.js';
import { badRequest, notFound } from '../lib/errors.js';
import { isIsoDate, localDate, untilLocalMidnight } from '../lib/time.js';
import { createEcbRates } from '../upstream/ecb.js';
import { fetchReceipt } from '../upstream/ekasa.js';
import { createSmlLookup } from '../upstream/peppol-sml.js';
import { fetchDocumentTypes } from '../upstream/peppol-smp.js';

const limit = (max) => ({ rateLimit: { max, timeWindow: '1 minute' } });

export default async function publicDataRoutes(app, { config, upstream, cache, resolver, lookup }) {
  const u = config.upstream;
  const ecb = createEcbRates(upstream, u);
  const lookupSmp = createSmlLookup({ zone: u.smlZone, legacyCname: u.smlLegacyCname, resolver });

  app.get('/v1/rates/ecb', {
    config: limit(120),
    schema: { querystring: { type: 'object', properties: { date: { type: 'string', maxLength: 10 } } } }
  }, async (request) => {
    const today = localDate();
    const date = request.query.date || today;
    if (!isIsoDate(date) || date > today) throw badRequest('BAD_REQUEST', 'Invalid date');
    const rates = await cache.remember(`rates:ecb:${date}`, (v) => (v && v.date < date && date < today ? 30 * DAY : untilLocalMidnight()), () => ecb.forDate(date));
    if (!rates) throw notFound('No rates for this date');
    return rates;
  });

  app.post('/v1/ekasa/receipt', {
    config: limit(20),
    schema: { body: { type: 'object', required: ['receiptId'], properties: { receiptId: { type: 'string', minLength: 1, maxLength: 100 } } } }
  }, async (request) => {
    const receipt = await fetchReceipt(upstream, u, request.body.receiptId.trim());
    if (!receipt) throw notFound('Receipt not found');
    return receipt;
  });

  app.get('/v1/peppol/lookup/:scheme/:id', {
    config: limit(60),
    schema: { params: { type: 'object', required: ['scheme', 'id'], properties: { scheme: { type: 'string', pattern: '^[0-9]{4}$' }, id: { type: 'string', minLength: 1, maxLength: 50, pattern: '^[A-Za-z0-9._:-]+$' } } } }
  }, async (request) => {
    const { scheme, id } = request.params;
    return cache.remember(`peppol:${scheme}:${id.toLowerCase()}`, DAY, async () => {
      const smpUrl = await lookupSmp(scheme, id);
      const checkedAt = new Date().toISOString();
      if (!smpUrl) return { registered: false, documentTypes: [], checkedAt };
      const found = await fetchDocumentTypes(upstream, smpUrl, scheme, id, { lookup });
      return { ...found, checkedAt };
    });
  });
}
