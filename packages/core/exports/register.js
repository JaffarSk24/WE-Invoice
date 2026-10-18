// The document register: one row per document and one row per line, the
// tables the CSV and XLSX exports and the accountant package share. Column
// headers and the names of kinds and statuses come from the caller (the
// app passes its dictionary), so the core holds no interface text; without
// them the stable codes are written.
import { documentTotals, paidTotal, openAmount, periodDate } from './period.js';
import { partnerOf } from './pohoda.js';
import { exportState } from './state.js';

export const REGISTER_COLUMNS = Object.freeze([
  'number', 'kind', 'status', 'issueDate', 'taxDate', 'dueDate', 'periodDate', 'partner', 'ico', 'dic', 'icDph', 'country',
  'currency', 'fxRate', 'net', 'vat', 'gross', 'payable', 'paid', 'open', 'vs', 'paymentMethod', 'exportState'
]);
export const LINE_COLUMNS = Object.freeze([
  'number', 'line', 'name', 'qty', 'unit', 'unitPrice', 'priceType', 'discountPct', 'vatCategory', 'vatRate', 'net', 'vat', 'total'
]);
const NUMBER_COLUMNS = new Set(['fxRate', 'net', 'vat', 'gross', 'payable', 'paid', 'open', 'qty', 'unitPrice', 'discountPct', 'vatRate', 'total']);

export function isNumberColumn(id) {
  return NUMBER_COLUMNS.has(id);
}

function label(labels, group, code) {
  return (labels && labels[group] && labels[group][code]) || code;
}

/** One register row per document, keyed by REGISTER_COLUMNS. */
export function registerRows(documents, labels = null) {
  return documents.map(d => {
    const totals = documentTotals(d);
    const p = partnerOf(d);
    return {
      number: d.number || '', kind: label(labels, 'kind', d.kind), status: label(labels, 'status', d.status),
      issueDate: d.issueDate || '', taxDate: d.taxDate || '', dueDate: d.dueDate || '', periodDate: periodDate(d) || '',
      partner: p.name || '', ico: p.ico || '', dic: p.dic || '', icDph: p.icDph || '', country: (p.address || {}).country || '',
      currency: d.currency || '', fxRate: d.fxRate || '', net: totals.net, vat: totals.vat, gross: totals.gross, payable: totals.payable,
      paid: paidTotal(d), open: openAmount(d, totals), vs: d.vs || '', paymentMethod: label(labels, 'payment', d.paymentMethod || ''),
      exportState: label(labels, 'exportState', exportState(d))
    };
  });
}

/** One row per item line of every document. */
export function lineRows(documents) {
  const rows = [];
  documents.forEach(d => {
    const totals = documentTotals(d);
    const source = (d.lines || []).filter(l => !l.kind || l.kind === 'ITEM');
    totals.lines.forEach((a, i) => {
      const l = source[i] || {};
      rows.push({
        number: d.number || '', line: String(i + 1), name: l.name || '', qty: l.qty || '', unit: (l.unit && (l.unit.label || l.unit.code)) || '',
        unitPrice: l.unitPrice || '', priceType: l.priceType || 'NET', discountPct: l.discountPct || '', vatCategory: a.category,
        vatRate: a.rate ?? '', net: a.net, vat: a.vat, total: a.total
      });
    });
  });
  return rows;
}

/** Columns for exportCsv from ids and header texts. */
export function csvColumns(ids, headers = null) {
  return ids.map(id => ({ key: id, header: (headers && headers[id]) || id }));
}

/** Rows for buildXlsx: a header row, then cells typed as numbers where they are. */
export function sheetRows(rows, ids, headers = null) {
  return [
    ids.map(id => (headers && headers[id]) || id),
    ...rows.map(r => ids.map(id => (isNumberColumn(id) && r[id] !== '' ? { value: r[id], type: 'number' } : r[id])))
  ];
}
