// VIES REST service of the European Commission: VAT number check. A
// member state that is down answers with a userError; that is an upstream
// failure, not an invalid number.
import { upstreamUnavailable } from '../lib/errors.js';
import { nullIfEmpty } from './legal-form.js';

const UNAVAILABLE = new Set(['MS_UNAVAILABLE', 'SERVICE_UNAVAILABLE', 'TIMEOUT', 'MS_MAX_CONCURRENT_REQ', 'GLOBAL_MAX_CONCURRENT_REQ', 'IP_BLOCKED', 'SERVER_BUSY']);

const clean = (v) => {
  const s = nullIfEmpty(v);
  return s && s !== '---' ? s.replace(/\s+/g, ' ') : null;
};

export function mapViesAnswer(data, checkedAt = new Date().toISOString()) {
  const error = data.userError && data.userError !== 'VALID' && data.userError !== 'INVALID' ? data.userError : null;
  if (error) throw upstreamUnavailable(UNAVAILABLE.has(error) ? `VIES member state unavailable: ${error}` : `VIES: ${error}`);
  return { valid: data.isValid === true || data.valid === true, name: clean(data.name), address: clean(data.address), checkedAt };
}

export async function checkVat(upstream, config, cc, number) {
  const data = await upstream.json('vies', `${config.viesUrl}/ms/${encodeURIComponent(cc)}/vat/${encodeURIComponent(number)}`);
  return mapViesAnswer(data);
}
