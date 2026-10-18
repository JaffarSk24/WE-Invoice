// The files of the accountant package for a period (03-features.md
// § 3.13): the register as CSV and XLSX, the XML of the chosen accounting
// programs, ISDOC and UBL per document, plus a summary of what is in it.
// PDFs and the human summary text are added by the app (they need the PDF
// engine and the dictionary); the app then zips everything with buildZip.
// Nothing here writes to the data: the caller marks the documents
// exported with exportedPatch() after the user has the file.
import { selectDocuments, documentTotals } from './period.js';
import { exportCsv } from './csv.js';
import { buildXlsx } from './xlsx.js';
import { registerRows, lineRows, csvColumns, sheetRows, REGISTER_COLUMNS, LINE_COLUMNS } from './register.js';
import { exportPohoda } from './pohoda.js';
import { exportMoneyS3 } from './money-s3.js';
import { exportOmega } from './omega.js';
import { buildIsdoc } from '../isdoc/build.js';
import { buildUbl } from '../ubl/index.js';
import { sum, round } from '../money/index.js';

export const ACCOUNTANT_FORMATS = Object.freeze(['csv', 'xlsx', 'pohoda', 'money', 'omega', 'isdoc', 'ubl', 'pdf']);
const DEFAULT_FORMATS = ['csv', 'xlsx', 'pohoda', 'isdoc', 'pdf'];
const DEFAULT_NAMES = { register: 'documents', lines: 'lines', pohoda: 'pohoda', money: 'money-s3' };

/** A file name part from a document number: letters, digits, dot, dash. */
export function safeName(text, fallback = 'document') {
  const s = String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return s || fallback;
}

/** Counts and sums per kind and currency, for the summary. */
export function periodSummary(documents) {
  const groups = new Map();
  documents.forEach(d => {
    const key = `${d.kind}|${d.currency}`;
    const t = documentTotals(d);
    const g = groups.get(key) || { kind: d.kind, currency: d.currency, count: 0, net: [], vat: [], gross: [] };
    g.count++;
    g.net.push(t.net);
    g.vat.push(t.vat);
    g.gross.push(t.gross);
    groups.set(key, g);
  });
  return [...groups.values()].map(g => ({
    kind: g.kind, currency: g.currency, count: g.count, net: round(sum(g.net), 2), vat: round(sum(g.vat), 2), gross: round(sum(g.gross), 2)
  }));
}

/**
 * @param {{company: object, documents: object[], contacts?: object[]}} data
 * @param {{from: string, to: string, now?: string, time?: string, formats?: string[],
 *   names?: object, headers?: object, lineHeaders?: object, labels?: object,
 *   buildUbl?: Function, ubl?: object}} ctx
 * @returns {Promise<{files: Array<{name: string, data: string|Uint8Array}>, documents: object[],
 *   summary: Array, skipped: Array, warnings: string[]}>}
 */
export async function accountantFiles(data, ctx) {
  const formats = new Set(ctx.formats || DEFAULT_FORMATS);
  const names = { ...DEFAULT_NAMES, ...(ctx.names || {}) };
  const documents = selectDocuments(data.documents, { from: ctx.from, to: ctx.to });
  const files = [];
  const skipped = [];
  const warnings = [];
  const xmlData = { documents: data.documents, contacts: data.contacts, company: data.company };
  const range = { from: ctx.from, to: ctx.to, now: ctx.now };

  if (formats.has('csv') || formats.has('xlsx')) {
    const register = registerRows(documents, ctx.labels);
    const lines = lineRows(documents);
    if (formats.has('csv')) {
      files.push({ name: `${names.register}.csv`, data: exportCsv(register, csvColumns(REGISTER_COLUMNS, ctx.headers)) });
      files.push({ name: `${names.lines}.csv`, data: exportCsv(lines, csvColumns(LINE_COLUMNS, ctx.lineHeaders)) });
    }
    if (formats.has('xlsx')) {
      files.push({
        name: `${names.register}.xlsx`,
        data: await buildXlsx([
          { name: names.register, rows: sheetRows(register, REGISTER_COLUMNS, ctx.headers) },
          { name: names.lines, rows: sheetRows(lines, LINE_COLUMNS, ctx.lineHeaders) }
        ], { time: ctx.time })
      });
    }
  }
  if (formats.has('pohoda')) {
    const r = exportPohoda(xmlData, { ...range, includeContacts: true, cashAccount: ctx.pohodaCashAccount });
    files.push({ name: `${names.pohoda}.xml`, data: r.content });
    r.skipped.forEach(s => skipped.push({ ...s, format: 'pohoda' }));
  }
  if (formats.has('money')) {
    const r = exportMoneyS3(xmlData, range);
    files.push({ name: `${names.money}.xml`, data: r.content });
    r.skipped.forEach(s => skipped.push({ ...s, format: 'money' }));
  }
  if (formats.has('omega')) {
    const r = exportOmega(xmlData, range);
    r.files.forEach(f => files.push({ name: f.name, data: f.data }));
    r.skipped.forEach(s => skipped.push({ ...s, format: 'omega' }));
    if (r.replaced) warnings.push('OMEGA_CHARACTERS_REPLACED');
  }
  if (formats.has('isdoc')) {
    documents.forEach(d => {
      try {
        files.push({ name: `isdoc/${safeName(d.number)}.isdoc`, data: buildIsdoc(d, { company: data.company, documents: data.documents }) });
      } catch (e) {
        skipped.push({ id: d.id, number: d.number, reason: e.code || 'ISDOC_FAILED', format: 'isdoc' });
      }
    });
  }
  if (formats.has('ubl')) addUbl(files, documents, data, ctx, skipped, warnings);
  return { files, documents, summary: periodSummary(documents), skipped, warnings };
}

// UBL comes from the Peppol package; until it is there (NOT_IMPLEMENTED),
// the package goes out without UBL and says so once.
function addUbl(files, documents, data, ctx, skipped, warnings) {
  const build = ctx.buildUbl || buildUbl;
  for (const d of documents.filter(doc => ['INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE', 'SELF_BILLING', 'ADVANCE_TAX_DOC'].includes(doc.kind))) {
    try {
      files.push({ name: `ubl/${safeName(d.number)}.xml`, data: build(d, { company: data.company, ...(ctx.ubl || {}) }) });
    } catch (e) {
      if (e && e.code === 'NOT_IMPLEMENTED') {
        warnings.push('UBL_NOT_AVAILABLE');
        return;
      }
      skipped.push({ id: d.id, number: d.number, reason: (e && e.code) || 'UBL_FAILED', format: 'ubl' });
    }
  }
}
