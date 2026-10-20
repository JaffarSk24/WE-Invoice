// Pohoda XML (Stormware dataPack 2.0) for the accountant: issued and
// received invoices (agenda invoice), cash documents and receipts (agenda
// voucher, "pokladňa") and optionally the contacts (agenda addressbook).
// Element order follows the Stormware schemas; prices go without VAT
// (payVAT false), VAT rates map through the legislation codes, so a rate
// change in law needs no change here: STANDARD is "high", REDUCED_1 "low",
// REDUCED_2 "third". Kinds Pohoda keeps in other agendas (the tax document
// to a received payment) are listed in `skipped` for the summary.
import { el, leaf, group, serializeXml } from './xml.js';
import { selectDocuments, documentTotals, breakdownByCode, periodDate, rateCode, isPurchase } from './period.js';

export const POHODA_NS = Object.freeze({
  dat: 'http://www.stormware.cz/schema/version_2/data.xsd',
  inv: 'http://www.stormware.cz/schema/version_2/invoice.xsd',
  vch: 'http://www.stormware.cz/schema/version_2/voucher.xsd',
  adb: 'http://www.stormware.cz/schema/version_2/addressbook.xsd',
  typ: 'http://www.stormware.cz/schema/version_2/type.xsd'
});

const INVOICE_TYPES = Object.freeze({
  INVOICE: 'issuedInvoice',
  SELF_BILLING: 'issuedInvoice',
  CREDIT_NOTE: 'issuedCreditNotice',
  DEBIT_NOTE: 'issuedDebitNote',
  PROFORMA: 'issuedAdvanceInvoice',
  RECEIVED_INVOICE: 'receivedInvoice',
  RECEIVED_CREDIT_NOTE: 'receivedCreditNotice'
});
const VOUCHER_TYPES = Object.freeze({ SALES_RECEIPT: 'receipt', CASH_IN: 'receipt', EXPENSE_RECEIPT: 'expense', CASH_OUT: 'expense' });
const RATE_NAMES = Object.freeze({ STANDARD: 'high', REDUCED_1: 'low', REDUCED_2: 'third' });
const PAYMENT_TYPES = Object.freeze({ TRANSFER: 'draft', CASH: 'cash', CARD: 'creditcard', COD: 'delivery', OFFSET: 'compensation', ONLINE: 'draft', QR_ON_SITE: 'draft' });

// The keys of both maps, written out (see ACCOUNTING_KINDS in period.js).
export const POHODA_KINDS = Object.freeze([
  'INVOICE', 'SELF_BILLING', 'CREDIT_NOTE', 'DEBIT_NOTE', 'PROFORMA', 'RECEIVED_INVOICE', 'RECEIVED_CREDIT_NOTE',
  'SALES_RECEIPT', 'CASH_IN', 'EXPENSE_RECEIPT', 'CASH_OUT'
]);

/** The other party of a document: the buyer of a sale, the seller of a purchase. */
export function partnerOf(document) {
  return (isPurchase(document) || document.kind === 'CASH_OUT' ? document.seller : document.buyer) || {};
}

function address(party, prefix = 'typ') {
  const a = party.address || {};
  return el(`${prefix}:address`, null,
    leaf('typ:company', party.name),
    leaf('typ:city', a.city),
    leaf('typ:street', a.street),
    leaf('typ:zip', a.zip),
    leaf('typ:ico', party.ico),
    leaf('typ:dic', party.dic),
    leaf('typ:icDph', party.icDph),
    a.country ? el('typ:country', null, leaf('typ:ids', a.country)) : null,
    leaf('typ:phone', party.phone),
    leaf('typ:email', party.email));
}

function rateOf(line, date) {
  if (line.category !== 'S') return { rateVAT: 'none', percentVAT: null };
  const code = rateCode(line.rate, date);
  return { rateVAT: RATE_NAMES[code] || 'high', percentVAT: line.rate };
}

function lineNodes(prefix, document, totals, date, foreign) {
  const source = (document.lines || []).filter(l => !l.kind || l.kind === 'ITEM');
  return totals.lines.map((amounts, i) => {
    const line = source[i] || {};
    const { rateVAT, percentVAT } = rateOf(amounts, date);
    const prices = [
      leaf('typ:unitPrice', amounts.unitNet),
      leaf('typ:price', amounts.net),
      leaf('typ:priceVAT', amounts.vat),
      leaf('typ:priceSum', amounts.total)
    ];
    return el(`${prefix}:${prefix === 'inv' ? 'invoiceItem' : 'voucherItem'}`, null,
      leaf(`${prefix}:text`, line.name),
      leaf(`${prefix}:quantity`, line.qty),
      leaf(`${prefix}:unit`, line.unit && (line.unit.label || line.unit.code)),
      leaf(`${prefix}:payVAT`, 'false'),
      leaf(`${prefix}:rateVAT`, rateVAT),
      prefix === 'inv' ? leaf('inv:percentVAT', percentVAT) : null,
      leaf(`${prefix}:discountPercentage`, line.discountPct),
      foreign ? el(`${prefix}:foreignCurrency`, null, prices) : el(`${prefix}:homeCurrency`, null, prices),
      leaf(`${prefix}:note`, line.description));
  });
}

function summary(prefix, document, totals, date, foreign) {
  const b = breakdownByCode(totals, date);
  const tag = prefix === 'inv' ? 'invoiceSummary' : 'voucherSummary';
  if (foreign) {
    return el(`${prefix}:${tag}`, null,
      leaf(`${prefix}:roundingDocument`, 'none'),
      el(`${prefix}:foreignCurrency`, null,
        el('typ:currency', null, leaf('typ:ids', document.currency)),
        leaf('typ:rate', document.fxRate),
        leaf('typ:amount', '1'),
        leaf('typ:priceSum', totals.gross)));
  }
  return el(`${prefix}:${tag}`, null,
    leaf(`${prefix}:roundingDocument`, 'none'),
    el(`${prefix}:homeCurrency`, null,
      leaf('typ:priceNone', b.none),
      leaf('typ:price3', b.REDUCED_2.base), leaf('typ:price3VAT', b.REDUCED_2.vat),
      leaf('typ:priceLow', b.REDUCED_1.base), leaf('typ:priceLowVAT', b.REDUCED_1.vat),
      leaf('typ:priceHigh', b.STANDARD.base), leaf('typ:priceHighVAT', b.STANDARD.vat),
      totals.rounding && totals.rounding !== '0.00' ? el('typ:round', null, leaf('typ:priceRound', totals.rounding)) : null));
}

function invoice(document, totals, date, foreign) {
  const purchase = isPurchase(document);
  const text = document.textIntro || (document.lines || [])[0]?.name || document.number;
  return el('inv:invoice', { version: '2.0' },
    el('inv:invoiceHeader', null,
      leaf('inv:invoiceType', INVOICE_TYPES[document.kind]),
      purchase ? null : el('inv:number', null, leaf('typ:numberRequested', document.number)),
      leaf('inv:symVar', document.vs),
      purchase ? leaf('inv:originalDocument', document.number) : null,
      leaf('inv:date', document.issueDate || date),
      leaf('inv:dateTax', document.taxDate || date),
      leaf('inv:dateAccounting', date),
      leaf('inv:dateDue', document.dueDate),
      leaf('inv:text', text && String(text).slice(0, 240)),
      el('inv:partnerIdentity', null, address(partnerOf(document))),
      el('inv:paymentType', null, leaf('typ:paymentType', PAYMENT_TYPES[document.paymentMethod] || 'draft')),
      leaf('inv:symConst', document.ks),
      leaf('inv:symSpec', document.ss),
      leaf('inv:note', document.textOutro),
      leaf('inv:intNote', document.noteInternal)),
    group('inv:invoiceDetail', null, lineNodes('inv', document, totals, date, foreign)),
    summary('inv', document, totals, date, foreign));
}

function voucher(document, totals, date, ctx) {
  return el('vch:voucher', { version: '2.0' },
    el('vch:voucherHeader', null,
      leaf('vch:voucherType', VOUCHER_TYPES[document.kind]),
      ctx.cashAccount ? el('vch:cashAccount', null, leaf('typ:ids', ctx.cashAccount)) : null,
      leaf('vch:originalDocument', document.number),
      leaf('vch:date', document.issueDate || date),
      leaf('vch:datePayment', document.issueDate || date),
      leaf('vch:dateTax', document.taxDate || date),
      leaf('vch:text', (document.textIntro || (document.lines || [])[0]?.name || document.number || '').slice(0, 240)),
      el('vch:partnerIdentity', null, address(partnerOf(document))),
      leaf('vch:note', document.textOutro),
      leaf('vch:intNote', document.noteInternal)),
    group('vch:voucherDetail', null, lineNodes('vch', document, totals, date, false)),
    summary('vch', document, totals, date, false));
}

/** A contact as a Pohoda addressbook record. */
export function pohodaAddressbook(contact) {
  const email = (contact.emails || [])[0];
  const party = {
    name: contact.name, ico: contact.ico, dic: contact.dic, icDph: contact.icDph,
    address: { ...(contact.billingAddress || {}), country: (contact.billingAddress || {}).country || contact.country }
  };
  return el('adb:addressbook', { version: '2.0' },
    el('adb:addressbookHeader', null,
      el('adb:identity', null, address(party)),
      leaf('adb:phone', contact.phone),
      leaf('adb:email', email && email.address),
      leaf('adb:maturity', contact.dueDays),
      leaf('adb:note', contact.note)));
}

/**
 * Pohoda dataPack of a period.
 * @param {{documents: object[], contacts?: object[], company: object}} data
 * @param {{from?: string, to?: string, id?: string, includeContacts?: boolean, cashAccount?: string}} [ctx]
 * @returns {{content: string, count: number, skipped: Array<{id: string, number: string, reason: string}>}}
 */
export function exportPohoda(data, ctx = {}) {
  const company = data.company || {};
  const docs = selectDocuments(data.documents, { from: ctx.from, to: ctx.to, includeCancelled: false });
  const skipped = [];
  const items = [];
  docs.forEach(document => {
    const isInvoice = Boolean(INVOICE_TYPES[document.kind]);
    if (!isInvoice && !VOUCHER_TYPES[document.kind]) {
      skipped.push({ id: document.id, number: document.number, reason: 'KIND_NOT_IN_POHODA' });
      return;
    }
    const totals = documentTotals(document);
    const date = periodDate(document);
    const foreign = Boolean(document.currency && document.currency !== 'EUR');
    if (!isInvoice && foreign) {
      skipped.push({ id: document.id, number: document.number, reason: 'FOREIGN_CASH' });
      return;
    }
    const body = isInvoice ? invoice(document, totals, date, foreign) : voucher(document, totals, date, ctx);
    items.push(el('dat:dataPackItem', { id: `${document.kind}-${document.number || document.id}`, version: '2.0' }, body));
  });
  if (ctx.includeContacts) {
    (data.contacts || []).filter(c => !c.deleted).forEach(contact => {
      items.push(el('dat:dataPackItem', { id: `ADB-${contact.id}`, version: '2.0' }, pohodaAddressbook(contact)));
    });
  }
  const nsAttrs = Object.fromEntries(Object.entries(POHODA_NS).map(([k, v]) => [`xmlns:${k}`, v]));
  const root = el('dat:dataPack', {
    id: ctx.id || `WE${(ctx.from || '').replace(/-/g, '')}`,
    ico: company.ico || '',
    application: 'WE Invoice',
    version: '2.0',
    note: [ctx.from, ctx.to].filter(Boolean).join(' / '),
    ...nsAttrs
  }, items);
  return { content: serializeXml(root), count: docs.length - skipped.length, skipped };
}
