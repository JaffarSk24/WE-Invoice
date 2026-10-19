// Reading the Omega text format (R00 / R01 / R02 / R03 records, tab
// separated, see exports/omega.js): what KROS Omega exports in this
// layout and what WE Invoice itself writes for Omega, so a file can go
// both ways. Decimals use a comma, dates DD.MM.YYYY.
import { OMEGA_HEADER } from '../exports/omega.js';
import { emptyParsed, skip } from './report.js';
import { readDate, readAmount, readRate } from './values.js';
import { contactDraft, unitCode } from './records.js';
import { isZero, cmp, mul, div, round } from '../money/index.js';

const KINDS = {
  T01: { FA: 'INVOICE', ZF: 'PROFORMA', DB: 'CREDIT_NOTE', TP: 'DEBIT_NOTE', DD: 'ADVANCE_TAX_DOC' },
  T02: { FA: 'RECEIVED_INVOICE', DB: 'RECEIVED_CREDIT_NOTE' }
};

function vat(rate) {
  const r = readRate(rate);
  return r && !isZero(r) ? { vatCategory: 'S', vatRate: r } : { vatCategory: 'Z', vatRate: null };
}

export function importOmegaText(text, ctx = {}) {
  const parsed = emptyParsed();
  const records = String(text).split(/\r?\n/).filter(Boolean).map(l => l.split('\t'));
  const type = (records[0] || [])[1] === 'T02' ? 'T02' : 'T01';
  const own = ctx.company || {};
  const ownParty = { name: own.name || '', ico: own.ico || null, dic: own.dic || null, icDph: own.icDph || null, address: own.address || {}, vatPayer: own.vatMode === 'PAYER' };
  let current = null;
  const finish = () => {
    if (!current) return;
    // A document with VAT rows but no item rows gets one line per rate.
    if (!current.lines.length) {
      current.lines = current.vatGroups.filter(g => g.base && !isZero(g.base)).map((g, i) => ({
        id: `omega-vat-${i + 1}`, kind: 'ITEM', name: current.textIntro || '', qty: '1', unit: { code: 'C62', label: '' },
        unitPrice: g.base, priceType: 'NET', discountPct: null, ...vat(g.rate)
      }));
    }
    delete current.vatGroups;
    if (!current.lines.length) skip(parsed.report, 'documents', current.number, 'NO_AMOUNT');
    else parsed.documents.push(current);
    current = null;
  };
  records.forEach(fields => {
    const [rec, ...values] = fields;
    if (rec === 'R01') {
      finish();
      const h = Object.fromEntries(OMEGA_HEADER.map((k, i) => [k, values[i] ?? '']));
      const issueDate = readDate(h.issueDate);
      if (!h.number || !issueDate) {
        skip(parsed.report, 'documents', h.number, h.number ? 'MISSING_DATE' : 'MISSING_NUMBER');
        return;
      }
      const partner = contactDraft({ name: h.partner, ico: h.ico, dic: h.dic, icDph: h.icDph, street: h.street, city: h.city, zip: h.zip, country: h.country });
      if (partner) parsed.contacts.push(partner);
      const other = partner ? { contactId: null, name: partner.name, ico: partner.ico, dic: partner.dic, icDph: partner.icDph, address: partner.billingAddress, vatPayer: Boolean(partner.icDph) } : { name: '', address: {} };
      const purchase = type === 'T02';
      current = {
        kind: KINDS[type][h.kind] || (purchase ? 'RECEIVED_INVOICE' : 'INVOICE'), number: h.number, status: purchase ? 'PROCESSED' : 'ISSUED',
        issueDate, taxDate: readDate(h.taxDate) || issueDate, dueDate: readDate(h.dueDate), currency: h.currency || 'EUR',
        fxRate: h.currency && h.currency !== 'EUR' ? readAmount(h.fxRate) : null,
        vs: h.vs || null, ks: h.ks || null, ss: h.ss || null, seller: purchase ? other : ownParty, buyer: purchase ? ownParty : other,
        lines: [], paymentMethod: 'TRANSFER', textIntro: h.text || null, payments: [], links: [], vatGroups: []
      };
    } else if (rec === 'R02' && current) {
      current.vatGroups.push({ rate: values[0], base: readAmount(values[1]) });
    } else if (rec === 'R03' && current) {
      const [name, qtyText, unit, unitText, rate, netText] = values;
      const qty = readAmount(qtyText) || '1';
      const net = readAmount(netText);
      let unitPrice = readAmount(unitText) || '0';
      // The line net is after any discount; the unit price is before it.
      if (net !== null && !isZero(qty) && cmp(mul(unitPrice, qty), net) !== 0) unitPrice = round(div(net, qty, 10), 4);
      current.lines.push({ id: `omega-${current.lines.length + 1}`, kind: 'ITEM', name: name || '', qty, unit: { code: unitCode(unit), label: unit || '' }, unitPrice, priceType: 'NET', discountPct: null, ...vat(rate) });
    }
  });
  finish();
  return parsed;
}
