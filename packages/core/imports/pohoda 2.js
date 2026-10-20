// Pohoda XML import: a dataPack written for Pohoda (also what SuperFaktúra
// exports for Pohoda) or a responsePack exported from Pohoda. Invoices of
// both directions, the address book and stock items are read; prices
// entered with VAT stay GROSS lines. A rate given only by its Pohoda name
// (high, low, third) takes the rate in force on the document date from
// legislation. Documents without items get one line per VAT group of
// their summary.
import { parseXml, child, children, textAt, at, descendants } from './xml.js';
import { emptyParsed, skip, warn } from './report.js';
import { readDate, readAmount, readRate } from './values.js';
import { unitCode, contactDraft } from './records.js';
import { getLegislation } from '../legislation/index.js';
import { isZero } from '../money/index.js';

const KINDS = {
  issuedInvoice: 'INVOICE', issuedCreditNotice: 'CREDIT_NOTE', issuedDebitNote: 'DEBIT_NOTE', issuedAdvanceInvoice: 'PROFORMA',
  issuedProformaInvoice: 'PROFORMA', receivedInvoice: 'RECEIVED_INVOICE', receivedCreditNotice: 'RECEIVED_CREDIT_NOTE',
  receivedDebitNote: 'RECEIVED_INVOICE', receivedAdvanceInvoice: 'RECEIVED_INVOICE', receivedProformaInvoice: 'RECEIVED_INVOICE'
};
const RATE_CODES = { high: 'STANDARD', low: 'REDUCED_1', third: 'REDUCED_2' };
const METHODS = { draft: 'TRANSFER', cash: 'CASH', creditcard: 'CARD', delivery: 'COD', compensation: 'OFFSET', postal: 'TRANSFER' };

function rateByName(name, date) {
  const code = RATE_CODES[name];
  if (!code || !date) return null;
  try {
    const found = getLegislation('vatRates', date, 'SK').find(r => r.code === code);
    return found ? found.rate : null;
  } catch {
    return null;
  }
}

function party(node) {
  const a = at(node, 'address') || node;
  if (!a) return null;
  const draft = contactDraft({
    name: textAt(a, 'company') || textAt(a, 'name'), ico: textAt(a, 'ico'), dic: textAt(a, 'dic'), icDph: textAt(a, 'icDph'),
    street: textAt(a, 'street'), city: textAt(a, 'city'), zip: textAt(a, 'zip'), country: textAt(a, 'country/ids') || textAt(a, 'country'),
    email: textAt(a, 'email'), phone: textAt(a, 'phone') || textAt(a, 'mobilPhone')
  });
  return draft;
}

function snapshot(contact) {
  if (!contact) return { name: '', address: {} };
  return { contactId: null, name: contact.name, ico: contact.ico, dic: contact.dic, icDph: contact.icDph, address: contact.billingAddress, email: contact.emails[0]?.address || null, phone: contact.phone, vatPayer: Boolean(contact.icDph) };
}

function vat(rateVAT, percent, date) {
  const rate = readRate(percent) || (rateVAT && rateVAT !== 'none' ? rateByName(rateVAT, date) : null);
  if (!rate || isZero(rate)) return { vatCategory: rateVAT === 'none' || !rateVAT ? 'O' : 'Z', vatRate: null };
  return { vatCategory: 'S', vatRate: rate };
}

function line(item, i, date, foreign) {
  const prices = child(item, foreign ? 'foreignCurrency' : 'homeCurrency') || child(item, 'homeCurrency');
  const qty = readAmount(textAt(item, 'quantity')) || '1';
  const unitPrice = readAmount(textAt(prices, 'unitPrice')) || readAmount(textAt(prices, 'price')) || '0';
  const unit = textAt(item, 'unit');
  return {
    id: `pohoda-${i + 1}`, kind: 'ITEM', name: textAt(item, 'text') || '', description: textAt(item, 'note') || '',
    qty, unit: { code: unitCode(unit), label: unit || '' }, unitPrice,
    priceType: textAt(item, 'payVAT') === 'true' ? 'GROSS' : 'NET', discountPct: readAmount(textAt(item, 'discountPercentage')),
    ...vat(textAt(item, 'rateVAT'), textAt(item, 'percentVAT'), date)
  };
}

function summaryLines(summary, date) {
  const home = child(summary, 'homeCurrency');
  const groups = [['priceNone', null], ['price3', 'third'], ['priceLow', 'low'], ['priceHigh', 'high']];
  return groups.map(([el, name], i) => {
    const amount = readAmount(textAt(home, el));
    if (!amount || isZero(amount)) return null;
    return { id: `pohoda-sum-${i}`, kind: 'ITEM', name: '', qty: '1', unit: { code: 'C62', label: '' }, unitPrice: amount, priceType: 'NET', discountPct: null, ...vat(name || 'none', null, date) };
  }).filter(Boolean);
}

function invoice(node, parsed, ctx) {
  const header = child(node, 'invoiceHeader');
  const type = textAt(header, 'invoiceType');
  const kind = KINDS[type];
  const purchase = /^received/.test(type || '');
  const number = purchase ? textAt(header, 'originalDocument') || textAt(header, 'number/numberRequested') : textAt(header, 'number/numberRequested') || textAt(header, 'number/ids') || textAt(header, 'originalDocument');
  if (!kind) return skip(parsed.report, 'documents', number, 'KIND_UNSUPPORTED');
  if (!number) return skip(parsed.report, 'documents', textAt(header, 'symVar'), 'MISSING_NUMBER');
  const issueDate = readDate(textAt(header, 'date'));
  if (!issueDate) return skip(parsed.report, 'documents', number, 'MISSING_DATE');
  const foreignNode = at(node, 'invoiceSummary/foreignCurrency');
  const currency = textAt(foreignNode, 'currency/ids') || 'EUR';
  const foreign = currency !== 'EUR';
  let lines = children(child(node, 'invoiceDetail'), 'invoiceItem').map((item, i) => line(item, i, issueDate, foreign));
  if (!lines.length) {
    lines = foreign ? [] : summaryLines(child(node, 'invoiceSummary'), issueDate);
    if (lines.length) warn(parsed.report, 'documents', number, 'LINES_FROM_SUMMARY');
  }
  if (!lines.length) return skip(parsed.report, 'documents', number, 'NO_AMOUNT');
  const partner = party(at(header, 'partnerIdentity'));
  if (partner) parsed.contacts.push(partner);
  const own = ctx.company || {};
  const ownParty = { name: own.name || '', ico: own.ico || null, dic: own.dic || null, icDph: own.icDph || null, address: own.address || {}, vatPayer: own.vatMode === 'PAYER' };
  parsed.documents.push({
    kind, number, status: purchase ? 'PROCESSED' : 'ISSUED', issueDate,
    taxDate: readDate(textAt(header, 'dateTax')) || issueDate, dueDate: readDate(textAt(header, 'dateDue')),
    currency, fxRate: foreign ? readAmount(textAt(foreignNode, 'rate')) : null,
    vs: (textAt(header, 'symVar') || '').replace(/\D/g, '').slice(0, 10) || null,
    ks: (textAt(header, 'symConst') || '').replace(/\D/g, '').slice(0, 4) || null,
    ss: (textAt(header, 'symSpec') || '').replace(/\D/g, '').slice(0, 10) || null,
    seller: purchase ? snapshot(partner) : ownParty, buyer: purchase ? ownParty : snapshot(partner),
    lines, paymentMethod: METHODS[textAt(header, 'paymentType/paymentType')] || 'TRANSFER',
    textIntro: textAt(header, 'text'), textOutro: textAt(header, 'note'), noteInternal: textAt(header, 'intNote'),
    payments: [], links: []
  });
}

function addressbook(node, parsed) {
  const header = child(node, 'addressbookHeader');
  const identity = child(header, 'identity');
  const contact = party(identity);
  if (!contact) return skip(parsed.report, 'contacts', '', 'MISSING_NAME');
  contact.phone = contact.phone || textAt(header, 'phone') || textAt(header, 'mobil');
  const email = textAt(header, 'email');
  if (email && !contact.emails.length) contact.emails = [{ address: email, purposes: [] }];
  const due = textAt(header, 'maturity');
  if (due && /^\d+$/.test(due)) contact.dueDays = Number(due);
  contact.note = textAt(header, 'note') || '';
  parsed.contacts.push(contact);
}

function stock(node, parsed, ctx) {
  const header = child(node, 'stockHeader');
  const name = textAt(header, 'name');
  const price = readAmount(textAt(header, 'sellingPrice'));
  if (!name || price === null) return skip(parsed.report, 'items', name || textAt(header, 'code'), name ? 'MISSING_PRICE' : 'MISSING_NAME');
  const unit = textAt(header, 'unit');
  const today = ctx.today || null;
  parsed.items.push({
    name, code: textAt(header, 'code'), barcode: textAt(header, 'EAN'), unit: { code: unitCode(unit), label: unit || '' },
    price, priceType: textAt(header, 'sellingPricePayVAT') === 'true' ? 'GROSS' : 'NET',
    ...vat(textAt(header, 'sellingRateVAT'), null, today), currency: 'EUR', stockTracked: false, description: textAt(header, 'description') || ''
  });
}

/**
 * @param {string} xml
 * @param {{company?: object, today?: string}} [ctx]
 * @returns {{contacts: object[], items: object[], documents: object[], report: object}}
 */
export function importPohoda(xml, ctx = {}) {
  const root = parseXml(xml);
  const parsed = emptyParsed();
  descendants(root, 'invoice').filter(n => child(n, 'invoiceHeader')).forEach(n => invoice(n, parsed, ctx));
  descendants(root, 'addressbook').filter(n => child(n, 'addressbookHeader')).forEach(n => addressbook(n, parsed));
  descendants(root, 'stock').filter(n => child(n, 'stockHeader')).forEach(n => stock(n, parsed, ctx));
  const known = parsed.documents.length + parsed.contacts.length + parsed.items.length + parsed.report.skipped.length;
  if (!known) warn(parsed.report, 'documents', root.qname, 'NOTHING_FOUND');
  return parsed;
}
