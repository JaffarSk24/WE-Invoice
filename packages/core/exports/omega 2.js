// KROS Omega text import: tab separated records in windows-1250, CRLF.
//   R00 <TAB> T01   file header, T01 issued invoices, T02 received
//   R01 ...         one document header (fields in OMEGA_HEADER order)
//   R02 ...         one VAT rate row of the document (OMEGA_VAT order)
//   R03 ...         one item line (OMEGA_ITEM order)
// Decimals use a comma and dates DD.MM.YYYY, as Omega reads them. Tabs
// and line breaks inside values become spaces so a record stays a line.
// The field order is kept in the exported constants and printed in the
// summary of the accountant package, so it can be checked against the
// import template the accountant's Omega offers.
import { selectDocuments, documentTotals, breakdownByCode, periodDate, isPurchase } from './period.js';
import { partnerOf } from './pohoda.js';
import { encodeWindows1250 } from './encoding.js';

export const OMEGA_HEADER = Object.freeze([
  'number', 'kind', 'issueDate', 'taxDate', 'dueDate', 'vs', 'ks', 'ss', 'partner', 'ico', 'dic', 'icDph', 'street', 'city', 'zip',
  'country', 'currency', 'fxRate', 'base0', 'baseReduced2', 'vatReduced2', 'baseReduced1', 'vatReduced1', 'baseStandard', 'vatStandard',
  'gross', 'text'
]);
export const OMEGA_VAT = Object.freeze(['rate', 'base', 'vat']);
export const OMEGA_ITEM = Object.freeze(['name', 'qty', 'unit', 'unitPrice', 'rate', 'net', 'vat', 'total']);

const KIND_CODES = { INVOICE: 'FA', SELF_BILLING: 'FA', PROFORMA: 'ZF', CREDIT_NOTE: 'DB', DEBIT_NOTE: 'TP', ADVANCE_TAX_DOC: 'DD', RECEIVED_INVOICE: 'FA', RECEIVED_CREDIT_NOTE: 'DB' };

function value(v) {
  return v === null || v === undefined ? '' : String(v).replace(/[\t\r\n]+/g, ' ');
}

function decimal(v) {
  return value(v).replace('.', ',');
}

function date(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}

function record(type, fields) {
  return [type, ...fields.map(value)].join('\t');
}

function documentRecords(document) {
  const totals = documentTotals(document);
  const day = periodDate(document);
  const b = breakdownByCode(totals, day);
  const p = partnerOf(document);
  const a = p.address || {};
  const header = {
    number: document.number, kind: KIND_CODES[document.kind], issueDate: date(document.issueDate || day), taxDate: date(document.taxDate || day),
    dueDate: date(document.dueDate), vs: document.vs, ks: document.ks, ss: document.ss, partner: p.name, ico: p.ico, dic: p.dic, icDph: p.icDph,
    street: a.street, city: a.city, zip: a.zip, country: a.country, currency: document.currency, fxRate: decimal(document.fxRate),
    base0: decimal(b.none), baseReduced2: decimal(b.REDUCED_2.base), vatReduced2: decimal(b.REDUCED_2.vat),
    baseReduced1: decimal(b.REDUCED_1.base), vatReduced1: decimal(b.REDUCED_1.vat), baseStandard: decimal(b.STANDARD.base),
    vatStandard: decimal(b.STANDARD.vat), gross: decimal(totals.gross), text: document.textIntro || (document.lines || [])[0]?.name
  };
  const lines = [record('R01', OMEGA_HEADER.map(k => header[k]))];
  (totals.breakdown || []).forEach(g => {
    lines.push(record('R02', [g.category === 'S' ? decimal(g.rate) : '0', decimal(g.base), decimal(g.vat)]));
  });
  const source = (document.lines || []).filter(l => !l.kind || l.kind === 'ITEM');
  totals.lines.forEach((t, i) => {
    const l = source[i] || {};
    lines.push(record('R03', [l.name, decimal(l.qty), l.unit && (l.unit.label || l.unit.code), decimal(t.unitNet), decimal(t.rate ?? '0'), decimal(t.net), decimal(t.vat), decimal(t.total)]));
  });
  return lines;
}

/**
 * Omega import files of a period, one for issued and one for received
 * invoices (only those that have documents). ctx.names may name them
 * ({ T01, T02 }, without the extension).
 * @returns {{files: Array<{name: string, data: Uint8Array, text: string}>, count: number, replaced: number, skipped: Array}}
 */
export function exportOmega(data, ctx = {}) {
  const docs = selectDocuments(data.documents, { from: ctx.from, to: ctx.to, includeCancelled: false });
  const skipped = [];
  const groups = { T01: [], T02: [] };
  docs.forEach(d => {
    if (!KIND_CODES[d.kind]) {
      skipped.push({ id: d.id, number: d.number, reason: 'KIND_NOT_IN_OMEGA' });
      return;
    }
    groups[isPurchase(d) ? 'T02' : 'T01'].push(d);
  });
  const files = [];
  let replaced = 0;
  Object.entries(groups).forEach(([type, list]) => {
    if (!list.length) return;
    const text = `${[record('R00', [type]), ...list.flatMap(documentRecords)].join('\r\n')}\r\n`;
    const encoded = encodeWindows1250(text);
    replaced += encoded.replaced;
    const names = { T01: 'omega-issued', T02: 'omega-received', ...(ctx.names || {}) };
    files.push({ name: `${names[type]}.txt`, data: encoded.bytes, text });
  });
  return { files, count: docs.length - skipped.length, replaced, skipped };
}
