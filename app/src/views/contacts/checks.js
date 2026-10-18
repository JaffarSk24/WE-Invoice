// Register lookups and checks of a contact through the gateway: company
// details by IČO (SK RPO, CZ ARES), search by name, VAT number in VIES
// and the reliability of a Slovak VAT payer (03-features.md § 3.3). The
// traffic light of a VAT number is computed here as a pure function from
// the stored check results, which are kept for seven days.
import { CoreError, isValidVatId, isValidDic } from '@we-invoice/core';

export const CHECK_TTL_DAYS = 7;
const DAY_MS = 86400000;

// Calls one gateway endpoint and turns failures into codes the interface
// translates: COMPANY_NOT_FOUND, UPSTREAM_UNAVAILABLE, OFFLINE.
async function getJson(transport, path) {
  let response;
  try {
    response = await transport.http({ url: transport.gatewayUrl(path), method: 'GET', timeoutMs: 15000 });
  } catch (e) {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    throw new CoreError(offline ? 'OFFLINE' : 'UPSTREAM_UNAVAILABLE', `Request ${path} failed: ${e && e.message}`);
  }
  if (response.status === 404) throw new CoreError('COMPANY_NOT_FOUND', `${path} answered 404`);
  if (!response.ok) throw new CoreError('UPSTREAM_UNAVAILABLE', `${path} answered ${response.status}`);
  return response.json();
}

const digits = (v) => String(v || '').replace(/\s/g, '');

// Company details by IČO; country SK or CZ. Returns the CompanyLookup.
export async function lookupByIco(transport, ico, country = 'SK') {
  const id = digits(ico);
  const cz = country === 'CZ';
  if (!(cz ? /^\d{8}$/ : /^\d{6,8}$/).test(id)) throw new CoreError('ICO_FORMAT', `Bad company id ${ico}`);
  const data = await getJson(transport, `/v1/company/${cz ? 'cz' : 'sk'}/${id}`);
  if (!data || !data.name) throw new CoreError('UPSTREAM_UNAVAILABLE', 'Company lookup answer has no name');
  return data;
}

// Slovak companies by name (at least three letters).
export async function searchByName(transport, query) {
  const q = String(query || '').trim();
  if (q.length < 3) return [];
  const data = await getJson(transport, `/v1/company/sk/search?q=${encodeURIComponent(q.slice(0, 100))}`);
  return Array.isArray(data && data.results) ? data.results : [];
}

// VIES check of a VAT number ("SK2020123456"). Returns a CHECKED_VALUE.
export async function checkVies(transport, vatId) {
  const id = String(vatId || '').replace(/\s/g, '').toUpperCase();
  const data = await getJson(transport, `/v1/vat/vies/${id.slice(0, 2)}/${encodeURIComponent(id.slice(2))}`);
  return { value: { valid: Boolean(data.valid), name: data.name || null }, status: data.valid ? 'VALID' : 'INVALID', checkedAt: data.checkedAt || new Date().toISOString() };
}

// Reliability of a Slovak VAT payer from the lists of the Financial Administration.
export async function checkReliability(transport, icDph) {
  const id = String(icDph || '').replace(/\s/g, '').toUpperCase();
  const data = await getJson(transport, `/v1/vat/sk/${id}/reliability`);
  return { value: { lists: data.lists || [] }, status: data.status || 'UNKNOWN', checkedAt: data.checkedAt || new Date().toISOString() };
}

// Runs the checks a contact's VAT number allows and returns the patch to
// store: vatReliability holds the combined result. A Slovak number gets
// both the FS lists and VIES; a foreign EU number only VIES.
export async function runVatChecks(transport, contact, now = new Date()) {
  const id = String(contact.icDph || '').replace(/\s/g, '').toUpperCase();
  const checkedAt = now.toISOString();
  if (!id || !isValidVatId(id)) return { vatReliability: { value: null, status: id ? 'FORMAT' : 'NONE', checkedAt } };
  const results = {};
  const failures = [];
  const tasks = [checkVies(transport, id).then(r => { results.vies = r; })];
  if (id.startsWith('SK')) tasks.push(checkReliability(transport, id).then(r => { results.fs = r; }));
  (await Promise.allSettled(tasks)).forEach(r => { if (r.status === 'rejected') failures.push(r.reason); });
  if (!results.vies && !results.fs) throw failures[0] || new CoreError('UPSTREAM_UNAVAILABLE', 'VAT checks failed');
  failures.forEach(f => console.warn('A VAT check failed', f));
  const status = combinedStatus(results);
  return { vatReliability: { value: { vies: results.vies?.status || null, fs: results.fs?.status || null }, status, checkedAt } };
}

// Whether a Slovak contact receives eFaktúry: the Peppol participant
// 0245:<DIČ> in the SML and SMP. Returns the patch to store, or null for a
// contact without a valid Slovak DIČ.
export async function checkPeppol(transport, contact, now = new Date()) {
  const dic = String(contact.dic || '').replace(/\s/g, '');
  if ((contact.country || 'SK') !== 'SK' || !isValidDic(dic)) return null;
  const data = await getJson(transport, `/v1/peppol/lookup/0245/${dic}`);
  const registered = Boolean(data && data.registered);
  return {
    peppolCapable: { value: registered, status: registered ? 'REGISTERED' : 'NOT_REGISTERED', checkedAt: (data && data.checkedAt) || now.toISOString() },
    peppolId: registered ? `0245:${dic}` : contact.peppolId || null
  };
}

// The VAT checks and the Peppol lookup together; a failing Peppol lookup
// does not hide the VAT result.
export async function runAllChecks(transport, contact, now = new Date()) {
  const peppol = checkPeppol(transport, contact, now).catch(e => { console.warn('Peppol lookup failed', e); return null; });
  const patch = await runVatChecks(transport, contact, now);
  return { ...patch, ...((await peppol) || {}) };
}

// One status from the FS lists and VIES: a bad entry wins over a good one.
export function combinedStatus({ vies, fs }) {
  if (fs && ['REASONS_FOR_CANCELLATION', 'DELETED'].includes(fs.status)) return 'RED';
  if (vies && vies.status === 'INVALID') return 'RED';
  if ((fs && fs.status === 'OK') || (vies && vies.status === 'VALID')) return 'GREEN';
  return 'UNKNOWN';
}

// True when a stored check is younger than the cache period.
export function isFresh(checked, now = new Date()) {
  if (!checked || !checked.checkedAt) return false;
  const at = Date.parse(checked.checkedAt);
  return Number.isFinite(at) && now.getTime() - at < CHECK_TTL_DAYS * DAY_MS;
}

// The traffic light of a contact's VAT number:
//   green  valid SK VAT number or valid in VIES
//   yellow wrong format
//   red    on the FS list "reasons for cancellation" or invalid in VIES
//   grey   no number, never checked, the check is stale or failed
export function vatIndicator(contact, now = new Date()) {
  const id = String(contact?.icDph || '').replace(/\s/g, '');
  if (!id) return 'none';
  if (!isValidVatId(id)) return 'yellow';
  const checked = contact.vatReliability;
  if (!isFresh(checked, now)) return 'grey';
  if (checked.status === 'GREEN') return 'green';
  if (checked.status === 'RED') return 'red';
  if (checked.status === 'FORMAT') return 'yellow';
  return 'grey';
}
