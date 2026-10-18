// Receipt lookup in the public eKasa verification service of the Financial
// Administration (the "Over doklad" check). The service has no published
// contract, so the URL is configuration (EKASA_RECEIPT_URL) and the
// mapping tolerates several field names. Amounts are strings.
import { nullIfEmpty } from './legal-form.js';
import { pickField } from './fs-opendata.js';
import { zoneOffsetMinutes } from '../lib/time.js';
import { HttpError } from '../lib/errors.js';

const money = (v) => (v === undefined || v === null || v === '' ? undefined : String(v).replace(',', '.'));

// "dd.mm.yyyy hh:mm:ss" in Bratislava time or an ISO string to ISO UTC.
export function toIso(value) {
  const s = nullIfEmpty(value);
  if (!s) return null;
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const utcGuess = Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    const offset = zoneOffsetMinutes(new Date(utcGuess));
    return new Date(utcGuess - offset * 60000).toISOString();
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export function mapReceipt(data, receiptId) {
  const r = data && typeof data === 'object' ? data.receipt || data : null;
  if (!r || typeof r !== 'object' || (data.searchResult === false) || (!r.receiptId && !r.okp && !r.items)) return null;
  const org = r.organization || r.seller || {};
  const address = [pickField(org, 'streetName', 'street'), pickField(org, 'buildingNumber'), pickField(org, 'postalCode', 'zip'), pickField(org, 'municipality', 'city')].filter(Boolean).join(' ');
  const items = Array.isArray(r.items) ? r.items.map(i => ({
    name: nullIfEmpty(i.name) || '',
    qty: money(i.quantity ?? i.qty) || '1',
    price: money(i.price ?? i.total) || '0',
    vatRate: money(i.vatRate ?? i.vat) || '0'
  })) : [];
  const vat = {};
  for (const [key, label] of [['vatAmountBasic', 'basic'], ['vatAmountReduced', 'reduced'], ['vatAmountReduced2', 'reduced2']]) {
    if (r[key] !== undefined && r[key] !== null) vat[label] = money(r[key]);
  }
  return {
    receiptId: nullIfEmpty(r.receiptId) || receiptId,
    okp: nullIfEmpty(r.okp),
    issuedAt: toIso(r.issueDate || r.createDate || r.issuedAt),
    seller: { name: nullIfEmpty(org.name) || '', ico: nullIfEmpty(org.ico) || '', dic: nullIfEmpty(org.dic) || '', icDph: pickField(org, 'icDph', 'ic_dph'), address },
    items,
    totals: { total: money(r.totalPrice ?? r.total) || '0', vat }
  };
}

export async function fetchReceipt(upstream, config, receiptId) {
  if (!/^[A-Z0-9-]{5,100}$/i.test(receiptId)) throw new HttpError(400, 'BAD_REQUEST', 'Invalid receipt id');
  const data = await upstream.json('ekasa', config.ekasaReceiptUrl, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ receiptId }), okStatuses: [400, 422]
  });
  return mapReceipt(data, receiptId);
}
