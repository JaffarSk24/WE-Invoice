// Fields of a received invoice or receipt from its text (the text layer of
// a PDF or the result of OCR), by labels and checksums: IČO, DIČ, IČ DPH
// and IBAN count only when their check digits are right, amounts are
// cross-checked (net + VAT = total, base x rate = VAT). Everything found
// here needs the user's confirmation.
import { add, sub, abs, cmp, mul, div, round, sum } from '../../money/index.js';
import { bicFromIban } from '../../ids/index.js';
import { scanOf, findAll, labeled, toDate, toAmount, amountValue, amountsIn, lineAt, DATE_VALUE, AMOUNT } from './text-scan.js';
import { LABELS, KIND_HINTS, CURRENCIES } from './text-labels.js';
import { findIds, findIbans, findSupplierName } from './text-party.js';
import { emptyRecognition, setField, finish } from './result.js';

const NUMBER_VALUE = '(?:(?:c|cislo|no|nr)\\.?[ \\t]*:?[ \\t]*)?([a-z0-9][a-z0-9/.-]*\\d[a-z0-9/-]*)';
const near = (a, b, tolerance = '0.02') => cmp(abs(sub(a, b)), tolerance) <= 0;

function findDates(scan, result, ctx) {
  for (const name of ['issueDate', 'taxDate', 'dueDate']) {
    const hit = labeled(scan, LABELS[name], DATE_VALUE);
    const value = hit && toDate(hit.raw);
    if (value && plausibleYear(value, ctx)) {
      const generic = name === 'issueDate' && hit.label === LABELS.issueDate.length - 1;
      setField(result, name, value, ctx.source, generic ? 0.6 : 0.85);
    }
  }
  if (!result.fields.issueDate) {
    const first = findAll(scan.folded, DATE_VALUE).map(h => toDate(scan.text.slice(h.index, h.end))).find(d => d && plausibleYear(d, ctx));
    setField(result, 'issueDate', first, ctx.source, 0.4);
  }
}

function plausibleYear(date, ctx) {
  const year = Number(date.slice(0, 4));
  const now = Number(String(ctx.today || '2026-01-01').slice(0, 4));
  return year >= now - 10 && year <= now + 2;
}

function findSymbols(scan, result, ctx) {
  const specs = { vs: '(\\d{1,10})(?![\\d.,])', ks: '(\\d{4})(?![\\d.,])', ss: '(\\d{1,10})(?![\\d.,])' };
  Object.entries(specs).forEach(([name, value]) => {
    const hit = labeled(scan, LABELS[name], value);
    if (hit) setField(result, name, hit.raw, ctx.source, 0.85);
  });
  const number = labeled(scan, LABELS.number, NUMBER_VALUE);
  if (number) setField(result, 'number', number.raw.replace(/[.]$/, ''), ctx.source, number.label < LABELS.number.length - 2 ? 0.85 : 0.6);
  if (!result.fields.vs && result.fields.number && /^\d{1,10}$/.test(result.fields.number.replace(/\D/g, ''))) {
    setField(result, 'vs', result.fields.number.replace(/\D/g, ''), ctx.source, 0.5);
  }
}

function baseAndVat(amounts, rate) {
  for (let i = 0; i < amounts.length; i++) {
    if (cmp(abs(amounts[i]), '0') <= 0) continue;
    const expected = round(div(mul(amounts[i], rate), '100', 6), 2);
    const j = amounts.findIndex((a, k) => k > i && near(expected, a));
    if (j > 0) return { base: amounts[i], vat: amounts[j] };
  }
  return null;
}

// VAT breakdown rows: a rate in percent followed by base and VAT amounts
// that agree (base x rate / 100 = VAT within a cent or two).
export function findBreakdown(scan) {
  const rows = [];
  for (const hit of findAll(scan.folded, '(?:^|[^\\d.,])(\\d{1,2})(?:[.,]0{1,2})?[ \\t]*%')) {
    const rate = hit.groups[0];
    if (Number(rate) <= 0 || Number(rate) > 27) continue;
    const line = lineAt(scan.folded, hit.end - 1);
    const from = Math.max(hit.index, line.start);
    // The base may stand before or after the rate: "23 % 100,00 23,00" or "100,00 23 % 23,00".
    const amounts = amountsIn(`${scan.folded.slice(line.start, from)} ${' '.repeat(hit.end - from)} ${scan.folded.slice(hit.end, line.end)}`);
    const row = baseAndVat(amounts, rate);
    if (row && !rows.some(r => r.rate === rate && r.base === row.base)) rows.push({ category: 'S', rate, ...row });
  }
  return rows;
}

function findAmounts(scan, result, ctx) {
  const value = amountValue();
  // "DPH 23 %: 14,72": the rate may stand between the VAT label and the amount.
  const vatValue = `(?:\\d{1,2}(?:[.,]\\d+)?[ \\t]*%[ \\t]*:?[ \\t]*)?${value}`;
  for (const name of ['total', 'net', 'vat']) {
    const hit = labeled(scan, LABELS[name], name === 'vat' ? vatValue : value);
    if (hit) setField(result, name, toAmount(hit.raw.match(new RegExp(AMOUNT))[0]), ctx.source, 0.75);
  }
  const breakdown = findBreakdown(scan);
  if (breakdown.length) {
    setField(result, 'breakdown', breakdown, ctx.source, 0.8);
    const net = round(sum(breakdown.map(b => b.base)), 2);
    const vat = round(sum(breakdown.map(b => b.vat)), 2);
    // Cross-checked rows beat a value read after a label.
    setField(result, 'net', net, ctx.source, 0.9);
    setField(result, 'vat', vat, ctx.source, 0.9);
  }
  const { net, vat, total } = result.fields;
  if (net && vat && total && near(add(net, vat), total)) {
    ['net', 'vat', 'total'].forEach(k => setField(result, k, result.fields[k], ctx.source, 0.95));
  } else if (net && vat && !total) {
    setField(result, 'total', round(add(net, vat), 2), ctx.source, 0.7);
  }
  if (!result.fields.total) {
    const all = amountsIn(scan.folded).filter(a => cmp(a, '0') > 0);
    if (all.length) setField(result, 'total', all.reduce((a, b) => (cmp(a, b) >= 0 ? a : b)), ctx.source, 0.4);
  }
}

function findCurrency(scan, result, ctx) {
  const counts = CURRENCIES.map(c => ({ code: c.code, n: findAll(scan.folded, c.pattern).length })).sort((a, b) => b.n - a.n);
  if (counts[0].n) setField(result, 'currency', counts[0].code, ctx.source, 0.85);
  else setField(result, 'currency', (ctx.company && ctx.company.defaults?.currency) || 'EUR', ctx.source, 0.3);
}

function findKind(scan, result, ctx) {
  const hint = KIND_HINTS.find(h => findAll(scan.folded, h.pattern).length);
  setField(result, 'kind', hint ? hint.kind : 'RECEIVED_INVOICE', ctx.source, hint ? 0.8 : 0.6);
}

/**
 * Fields of an invoice or receipt from its text.
 * @param {string} text
 * @param {{company?: object, today?: string, source?: 'text'|'ocr'}} [ctx]
 *   company: the user's own company, whose identifiers and IBANs are not
 *   the supplier's; source: 'ocr' when the text comes from a picture.
 * @returns {{format: string, fields: object, sources: object, fieldConfidence: object, confidence: number,
 *   needsConfirmation: boolean, warnings: string[]}}
 */
export function extractInvoiceFields(text, ctx = {}) {
  const c = { ...ctx, source: ctx.source === 'ocr' ? 'ocr' : 'text' };
  const scan = scanOf(text);
  const result = emptyRecognition(c.source === 'ocr' ? 'OCR' : 'TEXT');
  findKind(scan, result, c);
  findIds(scan, result, c);
  findIbans(scan, result, c);
  findSupplierName(scan, result, c);
  findSymbols(scan, result, c);
  findDates(scan, result, c);
  findAmounts(scan, result, c);
  findCurrency(scan, result, c);
  if (result.fields.iban && !result.fields.bic) setField(result, 'bic', bicFromIban(result.fields.iban), c.source, 0.9);
  if (c.source === 'ocr') Object.keys(result.fieldConfidence).forEach(k => { result.fieldConfidence[k] = Math.round(result.fieldConfidence[k] * 85) / 100; });
  finish(result);
  result.needsConfirmation = true;
  return result;
}
