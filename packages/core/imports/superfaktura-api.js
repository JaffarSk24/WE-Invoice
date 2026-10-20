// SuperFaktúra API (moja.superfaktura.sk, MIT client superfaktura/apiclient):
// the requests of a migration and what their answers become. Pure: the app
// sends the requests (directly on the desktop, through the gateway in the
// browser) and hands the parsed answers here. Lists come page by page
// (listinfo:1, up to 100 per page); invoice details in batches of ids.
// Field names follow the API's answers; a field that is missing is
// skipped, never guessed.
import { CoreError } from '../errors.js';
import { emptyParsed, skip, warn } from './report.js';
import { readDate, readAmount, readRate, readText, readCountry } from './values.js';
import { contactDraft, unitCode } from './records.js';
import { isZero } from '../money/index.js';

export { SF_MARKETS } from './superfaktura-markets.js';
export const SF_PAGE_SIZE = 100;
export const SF_DETAIL_BATCH = 25;
const LISTS = { clients: 'clients', items: 'stock_items', invoices: 'invoices' };

/** The Authorization header value ("SFAPI email=...&apikey=...&company_id=..."). */
export function sfAuthorization({ email, apiKey, companyId = null }) {
  if (!email || !apiKey) throw new CoreError('SF_CREDENTIALS_MISSING', 'e-mail and API key are required');
  // Encoded like PHP http_build_query, which the API's own client uses.
  const enc = (v) => encodeURIComponent(String(v)).replace(/%20/g, '+');
  const pairs = [['email', email], ['apikey', apiKey], ...(companyId ? [['company_id', companyId]] : []), ['module', 'WE Invoice']];
  return `SFAPI ${pairs.map(([k, v]) => `${k}=${enc(v)}`).join('&')}`;
}

/** Path of one page of a list: /clients/index.json/listinfo:1/page:2/per_page:100 */
export function sfListPath(list, page, perPage = SF_PAGE_SIZE) {
  if (!LISTS[list]) throw new CoreError('SF_LIST_UNKNOWN', `unknown list ${list}`);
  return `/${LISTS[list]}/index.json/listinfo:1/page:${page}/per_page:${perPage}`;
}

/** Path of the details of several invoices at once. */
export function sfDetailsPath(ids) {
  return `/invoices/getInvoiceDetails/${ids.map(id => String(id).replace(/\D/g, '')).filter(Boolean).join(',')}`;
}

/** An error answer of the API as a CoreError, or null for a normal answer. */
export function sfError(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (body.error && body.error !== '0' && body.error !== 0) {
    const message = String(body.error_message || body.message || body.error);
    return new CoreError(/autoriz|authori|apikey|api key/i.test(message) ? 'SF_UNAUTHORIZED' : 'SF_API_ERROR', message);
  }
  return null;
}

/** One page of a list answer: the records and how many pages there are. */
export function readSfPage(body) {
  const error = sfError(body);
  if (error) throw error;
  if (Array.isArray(body)) return { records: body, page: 1, pageCount: 1, itemCount: body.length };
  if (!body || !Array.isArray(body.items)) throw new CoreError('SF_ANSWER_UNREADABLE', 'not a list answer');
  return {
    records: body.items,
    page: Number(body.page) || 1,
    pageCount: Math.max(1, Number(body.pageCount) || 1),
    itemCount: Number(body.itemCount) || body.items.length
  };
}

/** The records of a details answer ({"12": {Invoice, InvoiceItem, ...}} or a list). */
export function readSfDetails(body) {
  const error = sfError(body);
  if (error) throw error;
  if (Array.isArray(body)) return body;
  if (body && body.Invoice) return [body];
  return Object.values(body || {}).filter(v => v && typeof v === 'object' && v.Invoice);
}

export function sfClientDraft(client) {
  const c = client.Client || client;
  const draft = contactDraft({
    name: c.name, ico: c.ico, dic: c.dic, icDph: c.ic_dph, street: c.address, city: c.city, zip: c.zip,
    country: c.country_iso_id || c.country, email: c.email, phone: c.phone, iban: c.iban, dueDays: c.due_date, note: c.comment
  });
  if (draft && c.currency) draft.currency = String(c.currency).toUpperCase().slice(0, 3);
  return draft;
}

export function sfItemDraft(record) {
  const s = record.StockItem || record;
  const name = readText(s.name);
  const price = readAmount(s.unit_price);
  if (!name || price === null) return null;
  const rate = readRate(s.vat);
  return {
    name, code: readText(s.sku), barcode: readText(s.ean), unit: { code: unitCode(s.unit), label: readText(s.unit) || '' },
    price, priceType: 'NET', vatCategory: rate && !isZero(rate) ? 'S' : 'Z', vatRate: rate && !isZero(rate) ? rate : null,
    currency: 'EUR', stockTracked: Boolean(s.watch_stock), description: readText(s.description) || ''
  };
}

const KINDS = { regular: 'INVOICE', proforma: 'PROFORMA', cancel: 'CREDIT_NOTE', estimate: 'QUOTE', order: 'ORDER_IN', delivery: 'DELIVERY_NOTE', reverse_order: 'ORDER_OUT' };
const METHODS = { transfer: 'TRANSFER', cash: 'CASH', card: 'CARD', credit: 'CARD', cod: 'COD', paypal: 'ONLINE', gopay: 'ONLINE', besteron: 'ONLINE', barion: 'ONLINE', viamo: 'ONLINE', trustpay: 'ONLINE', barter: 'OFFSET', accreditation: 'OFFSET', other: 'TRANSFER' };

function symbol(value, length) {
  return (readText(value) || '').replace(/\D/g, '').slice(0, length) || null;
}

/**
 * One invoice of the details answer as a document draft.
 * @returns {{document: object|null, partner: object|null, reason: string|null, warnings: string[]}}
 */
export function sfInvoiceDraft(record, ctx = {}) {
  const inv = record.Invoice || {};
  const kind = KINDS[inv.type];
  const number = readText(inv.invoice_no_formatted) || readText(inv.invoice_no);
  if (!kind) return { document: null, partner: null, reason: 'KIND_UNSUPPORTED', warnings: [] };
  if (!number) return { document: null, partner: null, reason: 'MISSING_NUMBER', warnings: [] };
  const issueDate = readDate(inv.created);
  if (!issueDate) return { document: null, partner: null, reason: 'MISSING_DATE', warnings: [] };
  const warnings = [];
  const currency = (readText(inv.invoice_currency) || readText(inv.currency) || 'EUR').toUpperCase().slice(0, 3);
  const lines = (record.InvoiceItem || []).map((item, i) => {
    const rate = readRate(item.tax);
    return {
      id: `sf-${i + 1}`, kind: 'ITEM', itemId: null, itemCode: readText(item.sku), name: readText(item.name) || '', description: readText(item.description) || '',
      qty: readAmount(item.quantity) || '1', unit: { code: unitCode(item.unit), label: readText(item.unit) || '' },
      unitPrice: readAmount(item.unit_price) || '0', priceType: 'NET', discountPct: readAmount(item.discount) && !isZero(readAmount(item.discount)) ? readAmount(item.discount) : null,
      vatCategory: rate && !isZero(rate) ? 'S' : 'Z', vatRate: rate && !isZero(rate) ? rate : null
    };
  });
  if (!lines.length) return { document: null, partner: null, reason: 'NO_AMOUNT', warnings };
  const partner = record.Client ? sfClientDraft(record.Client) : null;
  const own = ctx.company || {};
  const ownParty = { name: own.name || '', ico: own.ico || null, dic: own.dic || null, icDph: own.icDph || null, address: own.address || {}, vatPayer: own.vatMode === 'PAYER' };
  const fxRate = currency !== 'EUR' ? readAmount(inv.exchange_rate) : null;
  if (currency !== 'EUR' && !fxRate) warnings.push('FX_RATE_MISSING');
  const payments = (record.InvoicePayment || []).map((p, i) => {
    const amount = readAmount(p.amount);
    const date = readDate(p.payment_date) || readDate(p.created);
    if (amount === null || isZero(amount) || !date) return null;
    return { id: `sf-payment-${i + 1}`, date, amount, currency: (readText(p.currency) || currency).toUpperCase().slice(0, 3), method: METHODS[p.payment_type] || 'TRANSFER', source: 'MANUAL', note: null };
  }).filter(Boolean);
  const document = {
    kind, number, status: 'ISSUED', issueDate, taxDate: readDate(inv.delivery) || issueDate, dueDate: readDate(inv.due),
    currency, fxRate, vs: symbol(inv.variable, 10), ks: symbol(inv.constant, 4), ss: symbol(inv.specific, 10),
    seller: ownParty,
    buyer: partner ? { contactId: null, name: partner.name, ico: partner.ico, dic: partner.dic, icDph: partner.icDph, address: partner.billingAddress, email: partner.emails[0]?.address || null, phone: partner.phone, vatPayer: Boolean(partner.icDph) } : { name: readText(inv.client_name) || '', address: { country: readCountry(inv.client_country) } },
    lines, paymentMethod: METHODS[inv.payment_type] || 'TRANSFER', orderReference: readText(inv.order_no),
    textIntro: readText(inv.header_comment), textOutro: readText(inv.comment), noteInternal: readText(inv.internal_comment),
    payments, links: []
  };
  return { document, partner, reason: null, warnings };
}

/** Everything fetched from the API as drafts with a report, for the plan. */
export function importSuperfakturaApi({ clients = [], items = [], invoices = [] }, ctx = {}) {
  const parsed = emptyParsed();
  clients.forEach(c => {
    const draft = sfClientDraft(c);
    if (draft) parsed.contacts.push(draft);
    else skip(parsed.report, 'contacts', (c.Client || c).id, 'MISSING_NAME');
  });
  items.forEach(i => {
    const draft = sfItemDraft(i);
    if (draft) parsed.items.push(draft);
    else skip(parsed.report, 'items', (i.StockItem || i).name || (i.StockItem || i).id, 'MISSING_PRICE');
  });
  invoices.forEach(record => {
    const { document, partner, reason, warnings } = sfInvoiceDraft(record, ctx);
    const ref = (record.Invoice || {}).invoice_no_formatted || (record.Invoice || {}).id;
    if (!document) return skip(parsed.report, 'documents', ref, reason);
    parsed.documents.push(document);
    if (partner) parsed.contacts.push(partner);
    warnings.forEach(code => warn(parsed.report, 'documents', document.number, code));
  });
  return parsed;
}
