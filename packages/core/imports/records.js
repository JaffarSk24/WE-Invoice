// Drafts of records from fields read out of another program's files:
// contacts, price list items and documents with lines and payments. The
// drafts have the shape of the data model but no id or timestamps yet;
// the import plan decides which of them are new and stamps them.
import { readDate, readAmount, readIco, readTaxId, readText, readAddress, readRate, normalizeKey } from './values.js';
import { div, mul, sub, round, cmp, abs, isZero } from '../money/index.js';
import { getLegislation } from '../legislation/index.js';

/** A contact draft; null when it has no name. */
export function contactDraft(f, ctx = {}) {
  const name = readText(f.name);
  if (!name) return null;
  let dic = readTaxId(f.dic);
  let icDph = readTaxId(f.icDph);
  // A Czech DIČ is the VAT number ("CZ12345678").
  if (dic && /^[A-Z]{2}/.test(dic) && !icDph) icDph = dic;
  if (dic && /^[A-Z]{2}/.test(dic) && !dic.startsWith('CZ')) dic = dic.slice(2);
  const address = readAddress(f, ctx.country || 'SK');
  const email = readText(f.email);
  const due = readAmount(f.dueDays);
  return {
    kind: readIco(f.ico) || icDph ? 'COMPANY' : 'PERSON',
    name, ico: readIco(f.ico), dic, icDph, country: address.country, billingAddress: address,
    deliveryAddresses: [], emails: email ? email.split(/[;,\s]+/).filter(Boolean).map(address => ({ address, purposes: [] })) : [],
    phone: readText(f.phone), iban: readTaxId(f.iban), dueDays: due !== null && /^\d+$/.test(due) ? Number(due) : null,
    tags: [], note: readText(f.note) || ''
  };
}

/** The legislation rate nearest to a computed one, when it is within half a point. */
export function snapRate(rate, date, country = 'SK') {
  let rates;
  try {
    rates = getLegislation('vatRates', date, country);
  } catch {
    return rate;
  }
  const near = rates.find(r => cmp(abs(sub(r.rate, rate)), '0.5') <= 0);
  return near ? near.rate : rate;
}

function vatOf(rate) {
  if (rate === null) return { vatCategory: 'O', vatRate: null };
  if (isZero(rate)) return { vatCategory: 'Z', vatRate: null };
  return { vatCategory: 'S', vatRate: rate };
}

/** A price list item draft; null without a name or a price. */
export function itemDraft(f, ctx = {}) {
  const name = readText(f.name);
  const net = readAmount(f.price);
  const gross = readAmount(f.priceGross);
  if (!name || (net === null && gross === null)) return null;
  const rate = readRate(f.vatRate);
  const unit = readText(f.unit);
  return {
    name, code: readText(f.code), barcode: readText(f.barcode),
    unit: { code: unitCode(unit), label: unit || '' },
    price: net !== null ? net : gross, priceType: net !== null ? 'NET' : 'GROSS',
    ...vatOf(rate), currency: ctx.currency || 'EUR', stockTracked: false, description: readText(f.description) || ''
  };
}

// UN/ECE Rec 20 codes of the units Slovak and Czech invoices use most.
const UNITS = { ks: 'H87', kus: 'H87', kusy: 'H87', pc: 'H87', pcs: 'H87', hod: 'HUR', h: 'HUR', hodina: 'HUR', hodiny: 'HUR', hour: 'HUR', kg: 'KGM', g: 'GRM', m: 'MTR', m2: 'MTK', m3: 'MTQ', l: 'LTR', km: 'KMT', den: 'DAY', dni: 'DAY', day: 'DAY', mes: 'MON', mesiac: 'MON', month: 'MON', bal: 'XPK', sada: 'SET', set: 'SET' };

export function unitCode(label) {
  return UNITS[normalizeKey(label).replace(/\.$/, '')] || 'C62';
}

const KINDS = {
  OUT: { faktura: 'INVOICE', fa: 'INVOICE', 'vydana faktura': 'INVOICE', invoice: 'INVOICE', dobropis: 'CREDIT_NOTE', 'opravny danovy doklad': 'CREDIT_NOTE', 'credit note': 'CREDIT_NOTE', tarchopis: 'DEBIT_NOTE', vrubopis: 'DEBIT_NOTE', 'zalohova faktura': 'PROFORMA', proforma: 'PROFORMA', 'proforma faktura': 'PROFORMA' },
  IN: { faktura: 'RECEIVED_INVOICE', 'prijata faktura': 'RECEIVED_INVOICE', invoice: 'RECEIVED_INVOICE', dobropis: 'RECEIVED_CREDIT_NOTE', 'credit note': 'RECEIVED_CREDIT_NOTE', blocek: 'EXPENSE_RECEIPT', uctenka: 'EXPENSE_RECEIPT', receipt: 'EXPENSE_RECEIPT' }
};

export function kindOf(value, direction = 'OUT') {
  const key = normalizeKey(value);
  return KINDS[direction][key] || (direction === 'IN' ? 'RECEIVED_INVOICE' : 'INVOICE');
}

const METHODS = { prevodom: 'TRANSFER', prevod: 'TRANSFER', 'bankovy prevod': 'TRANSFER', 'bankovni prevod': 'TRANSFER', transfer: 'TRANSFER', hotovost: 'CASH', 'v hotovosti': 'CASH', hotovostne: 'CASH', cash: 'CASH', karta: 'CARD', kartou: 'CARD', card: 'CARD', dobierka: 'COD', dobirka: 'COD', zapocet: 'OFFSET' };

export function methodOf(value) {
  return METHODS[normalizeKey(value)] || 'TRANSFER';
}

/**
 * One line from a row: a real item line when the row has a quantity or a
 * unit price, else a line carrying the row's net amount at the rate given
 * or derived from VAT / net (snapped to the rate in force).
 * @returns {{line: object|null, warning: string|null}}
 */
export function lineFromRow(f, date, index) {
  const name = readText(f.lineName) || readText(f.text) || '';
  const rateGiven = readRate(f.vatRate);
  const unit = readText(f.unit);
  const id = `import-${index + 1}`;
  if (readAmount(f.unitPrice) !== null) {
    return { line: { id, kind: 'ITEM', name, qty: readAmount(f.qty) || '1', unit: { code: unitCode(unit), label: unit || '' }, unitPrice: readAmount(f.unitPrice), priceType: 'NET', discountPct: null, ...vatOf(rateGiven) }, warning: null };
  }
  let net = readAmount(f.net);
  const vat = readAmount(f.vat);
  const gross = readAmount(f.gross);
  if (net === null && gross !== null) net = sub(gross, vat || '0');
  if (net === null) return { line: null, warning: 'NO_AMOUNT' };
  let rate = rateGiven;
  let warning = null;
  if (rate === null && vat !== null && !isZero(vat) && !isZero(net)) {
    rate = snapRate(round(mul(div(vat, net, 10), '100'), 2).replace(/\.?0+$/, ''), date);
    warning = 'RATE_DERIVED';
  }
  return { line: { id, kind: 'ITEM', name, qty: '1', unit: { code: 'C62', label: '' }, unitPrice: net, priceType: 'NET', discountPct: null, ...vatOf(rate) }, warning };
}

/**
 * A document draft from the rows of one document (several rows = several
 * lines). ctx.company gives our own party, ctx.direction OUT or IN.
 * @returns {{document: object|null, reason: string|null, warnings: string[]}}
 */
export function documentDraft(rows, ctx = {}) {
  const f = rows[0];
  const number = readText(f.number);
  const issueDate = readDate(f.issueDate) || readDate(f.taxDate);
  if (!number) return { document: null, reason: 'MISSING_NUMBER', warnings: [] };
  if (!issueDate) return { document: null, reason: 'MISSING_DATE', warnings: [] };
  const direction = ctx.direction === 'IN' ? 'IN' : 'OUT';
  const partner = contactDraft({ ...f, name: f.partner }, ctx);
  const warnings = [];
  const lines = [];
  rows.forEach((r, i) => {
    const { line, warning } = lineFromRow(r, issueDate, i);
    if (line) lines.push(line);
    if (warning) warnings.push(warning);
  });
  if (!lines.length) return { document: null, reason: 'NO_AMOUNT', warnings };
  const currency = (readText(f.currency) || ctx.currency || 'EUR').toUpperCase().slice(0, 3);
  const own = ctx.company || {};
  const ownParty = { name: own.name || '', ico: own.ico || null, dic: own.dic || null, icDph: own.icDph || null, address: own.address || {}, vatPayer: own.vatMode === 'PAYER' };
  const other = partner ? { contactId: null, name: partner.name, ico: partner.ico, dic: partner.dic, icDph: partner.icDph, address: partner.billingAddress, email: partner.emails[0]?.address || null, phone: partner.phone, vatPayer: Boolean(partner.icDph) } : { name: '', address: {} };
  const paid = readAmount(f.paid);
  const document = {
    kind: f.kind ? kindOf(f.kind, direction) : (direction === 'IN' ? 'RECEIVED_INVOICE' : 'INVOICE'),
    number,
    status: direction === 'IN' ? 'PROCESSED' : 'ISSUED',
    issueDate,
    taxDate: readDate(f.taxDate) || issueDate,
    dueDate: readDate(f.dueDate),
    currency,
    fxRate: currency !== 'EUR' ? readAmount(f.fxRate) : null,
    vs: (readText(f.vs) || '').replace(/\D/g, '').slice(0, 10) || null,
    ks: (readText(f.ks) || '').replace(/\D/g, '').slice(0, 4) || null,
    ss: (readText(f.ss) || '').replace(/\D/g, '').slice(0, 10) || null,
    seller: direction === 'IN' ? other : ownParty,
    buyer: direction === 'IN' ? ownParty : other,
    lines,
    paymentMethod: f.paymentMethod ? methodOf(f.paymentMethod) : 'TRANSFER',
    textIntro: rows.length > 1 || f.lineName ? readText(f.text) : null,
    payments: paid !== null && !isZero(paid) ? [{
      id: `import-payment-${number}`, date: readDate(f.paidDate) || readDate(f.dueDate) || issueDate, amount: paid, currency,
      method: f.paymentMethod ? methodOf(f.paymentMethod) : 'TRANSFER', source: 'MANUAL', note: null
    }] : [],
    links: []
  };
  return { document, partner, reason: null, warnings };
}
