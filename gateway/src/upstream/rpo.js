// Register of legal entities of Slovakia (RPO, api.statistics.sk/rpo/v1):
// company by IČO and search by name. Values carry validity ranges; the
// current one is the entry without validTo, else the newest.
import { mapLegalForm, nullIfEmpty } from './legal-form.js';

export function currentValue(entries) {
  if (!Array.isArray(entries) || !entries.length) return undefined;
  const open = entries.filter(e => e && !e.validTo);
  const pool = open.length ? open : entries;
  return pool.reduce((best, e) => (!best || String(e.validFrom || '') >= String(best.validFrom || '') ? e : best), undefined);
}

const text = (v) => (v && typeof v === 'object' ? nullIfEmpty(v.value) : nullIfEmpty(v));

export function mapRpoEntity(entity, checkedAt = new Date().toISOString()) {
  if (!entity) return null;
  const name = text(currentValue(entity.fullNames));
  if (!name) return null;
  const address = currentValue(entity.addresses) || {};
  const legal = currentValue(entity.legalForms);
  const legalValue = legal && legal.value && typeof legal.value === 'object' ? legal.value : legal || {};
  const numbers = [address.buildingNumber, address.regNumber].map(nullIfEmpty).filter(Boolean);
  const street = [text(address.street), numbers.join('/')].filter(Boolean).join(' ') || null;
  const zip = nullIfEmpty(Array.isArray(address.postalCodes) ? address.postalCodes[0] : address.postalCode);
  return {
    name,
    ico: text(currentValue(entity.identifiers)),
    dic: null,
    icDph: null,
    legalForm: mapLegalForm(legalValue.code),
    legalFormText: text(legalValue) || nullIfEmpty(legalValue.value),
    registerEntry: null,
    country: 'SK',
    address: { street, city: text(address.municipality), zip: zip ? zip.replace(/^(\d{3})(\d{2})$/, '$1 $2') : null, country: 'SK' },
    source: 'RPO',
    checkedAt
  };
}

export async function fetchCompanySk(upstream, config, ico) {
  const data = await upstream.json('rpo', `${config.rpoUrl}/search?identifier=${encodeURIComponent(ico)}`);
  const results = Array.isArray(data.results) ? data.results : [];
  const mapped = results.map(e => mapRpoEntity(e)).filter(Boolean);
  return mapped.find(c => c.ico === ico) || mapped[0] || null;
}

export async function searchCompaniesSk(upstream, config, query, limit = 20) {
  const data = await upstream.json('rpo', `${config.rpoUrl}/search?fullName=${encodeURIComponent(query)}`);
  const results = Array.isArray(data.results) ? data.results : [];
  return results.map(e => mapRpoEntity(e)).filter(Boolean).slice(0, limit);
}
