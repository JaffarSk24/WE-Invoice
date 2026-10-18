// From picked files to what the importers read: an XLSX becomes rows of
// its first sheet, a CSV rows of its text (UTF-8 or windows-1250), XML,
// ISDOC and text files their text. Then the importer of the chosen
// program parses them into drafts with a report.
import {
  readXlsx, readCsv, decodeText, isZip, importIdoklad, importSuperfaktura, importKros, importPohoda, importCsv, parseIsdoc,
  createReport
} from './core-bridge.js';
import { CoreError } from '@we-invoice/core';
import { fileBytes } from './files.js';

export const PROGRAMS = Object.freeze(['idoklad', 'superfaktura', 'kros', 'pohoda', 'isdoc', 'csv']);
export const ACCEPT = '.csv,.txt,.xlsx,.xml,.isdoc';

/** One file as { name, rows } (a table) or { name, text }. */
export async function readSourceFile(file) {
  const bytes = await fileBytes(file);
  const name = file.name || '';
  if (isZip(bytes)) {
    if (/\.isdocx$/i.test(name)) throw new CoreError('IMPORT_FORMAT_UNKNOWN', 'ISDOCX is not supported, use the ISDOC file');
    const book = await readXlsx(bytes);
    return { name, rows: book.rows };
  }
  if (/\.xls$/i.test(name) || (bytes[0] === 0xd0 && bytes[1] === 0xcf)) throw new CoreError('IMPORT_XLS_OLD', 'old binary XLS');
  const { text } = decodeText(bytes);
  if (/\.csv$/i.test(name) || (!/^\s*</.test(text) && !/^\s*R00\t/.test(text))) return { name, rows: readCsv(text) };
  return { name, text };
}

/**
 * @param {string} program  one of PROGRAMS
 * @param {Array<{name: string, rows?: string[][], text?: string}>} files
 * @param {{company: object, direction: 'OUT'|'IN', mappings?: Map<string, {entity, mapping}>}} ctx
 */
export function parseSources(program, files, ctx) {
  const tableCtx = (file) => ({ company: ctx.company, direction: ctx.direction, ...(ctx.mappings && ctx.mappings.get(file.name)) });
  switch (program) {
    case 'idoklad': return mergeResults(files.map(f => importIdoklad([f], tableCtx(f))));
    case 'superfaktura': return mergeResults(files.map(f => importSuperfaktura(f.rows ? [f] : f.text, tableCtx(f))));
    case 'kros': return mergeResults(files.map(f => importKros([f], tableCtx(f))));
    case 'pohoda': return mergeResults(files.map(f => importPohoda(requireText(f), { company: ctx.company })));
    case 'isdoc': return mergeResults(files.map(f => isdocResult(f, ctx)));
    default: return mergeResults(files.map(f => {
      const mapped = ctx.mappings && ctx.mappings.get(f.name);
      return importCsv(f.rows || readCsv(requireText(f)), mapped ? mapped.mapping : null, { ...tableCtx(f), name: f.name });
    }));
  }
}

function requireText(file) {
  if (typeof file.text !== 'string') throw new CoreError('IMPORT_FORMAT_UNKNOWN', `${file.name} is a table, not XML`);
  return file.text;
}

function isdocResult(file, ctx) {
  const { document, warnings } = parseIsdoc(requireText(file), { direction: ctx.direction });
  const report = createReport();
  warnings.forEach(code => report.warnings.push({ entity: 'documents', ref: document.number, code }));
  const party = ctx.direction === 'IN' ? document.seller : document.buyer;
  const contacts = party && party.name ? [{ kind: 'COMPANY', name: party.name, ico: party.ico, dic: party.dic, icDph: party.icDph, country: party.address.country || 'SK', billingAddress: party.address, emails: party.email ? [{ address: party.email, purposes: [] }] : [], phone: party.phone, tags: [], note: '' }] : [];
  return { contacts, items: [], documents: [document], report };
}

function mergeResults(results) {
  const report = createReport();
  results.forEach(r => {
    report.skipped.push(...r.report.skipped);
    report.warnings.push(...r.report.warnings);
  });
  return {
    contacts: results.flatMap(r => r.contacts),
    items: results.flatMap(r => r.items),
    documents: results.flatMap(r => r.documents),
    report,
    tables: results.flatMap(r => r.tables || [])
  };
}
