// Migration from other invoicing programs (03-features.md § 3.13). Each
// program exports differently; these functions recognise what a file is
// and hand it to the reader that understands it:
//   iDoklad      CSV or XLSX lists (contacts, price list, invoices) and ISDOC
//   SuperFaktúra Pohoda XML (its export for accountants) or its CSV / XLSX lists
//   KROS         Omega text export, Pohoda style XML, XLSX or CSV lists
// A table comes as rows (the app reads XLSX with readXlsx and CSV with
// readCsv); XML and text come as strings.
import { CoreError } from '../errors.js';
import { importRows } from './table.js';
import { importPohoda } from './pohoda.js';
import { emptyParsed, skip, mergeReports } from './report.js';
import { parseIsdoc } from '../isdoc/parse.js';
import { importOmegaText } from './omega.js';
import { readCsv } from './csv.js';

// Header names of the programs that differ from the shared list.
const IDOKLAD = {
  documents: { number: ['cislo dokladu', 'cislo faktury'], partner: ['odberatel', 'nazev odberatele', 'kontakt'], gross: ['celkem s dph', 'celkem'], paid: ['uhrazeno', 'uhrazena castka'], paidDate: ['datum uhrady'] },
  contacts: { name: ['nazev firmy', 'firma', 'nazev'] }
};
const SUPERFAKTURA = {
  documents: { number: ['faktura c.', 'cislo faktury', 'faktura cislo'], partner: ['klient', 'odberatel', 'nazov klienta'], gross: ['suma s dph', 'celkom'], paid: ['uhradene', 'zaplatene'] },
  contacts: { name: ['klient', 'nazov klienta', 'nazov'] }
};
const KROS = {
  documents: { number: ['cislo dokladu', 'doklad c.', 'cislo faktury'], partner: ['odberatel', 'partner', 'nazov partnera'], gross: ['spolu s dph', 'celkom', 'suma'] },
  contacts: { name: ['nazov partnera', 'obchodne meno', 'nazov'] }
};

function looksLikeXml(text) {
  return typeof text === 'string' && /^\s*(\ufeff)?\s*</.test(text);
}

// One source file: { name, rows } for a table, { name, text } for text.
function importFile(file, ctx, extraNames) {
  if (file.rows) return importRows(file.rows, { ...ctx, extraNames });
  const text = String(file.text || '');
  if (/^\s*R00\t/.test(text)) return importOmegaText(text, ctx);
  if (looksLikeXml(text)) {
    if (/<(\w+:)?Invoice[\s>][\s\S]*isdoc\.cz/.test(text)) {
      const parsed = emptyParsed();
      try {
        const { document, warnings } = parseIsdoc(text, { direction: ctx.direction || 'OUT' });
        parsed.documents.push(document);
        warnings.forEach(code => parsed.report.warnings.push({ entity: 'documents', ref: document.number, code }));
      } catch (e) {
        skip(parsed.report, 'documents', file.name, e.code || 'ISDOC_INVALID');
      }
      return parsed;
    }
    return importPohoda(text, ctx);
  }
  throw new CoreError('IMPORT_FORMAT_UNKNOWN', `${file.name || 'file'} is not a format this importer reads`);
}

function importFiles(files, ctx, extraNames) {
  const list = Array.isArray(files) ? files : [files];
  const results = list.map(f => importFile(f, ctx, extraNames));
  return {
    contacts: results.flatMap(r => r.contacts),
    items: results.flatMap(r => r.items),
    documents: results.flatMap(r => r.documents),
    report: mergeReports(results.map(r => r.report))
  };
}

export function importIdoklad(files, ctx = {}) {
  return importFiles(files, ctx, IDOKLAD);
}

export function importSuperfaktura(files, ctx = {}) {
  if (typeof files === 'string') return importPohoda(files, ctx);
  return importFiles(files, ctx, SUPERFAKTURA);
}

export function importKros(files, ctx = {}) {
  return importFiles(files, ctx, KROS);
}

/**
 * Generic CSV with a column mapping (null to guess it from the header).
 * @param {string|string[][]} text  the CSV text, or rows already read
 */
export function importCsv(text, mapping, ctx = {}) {
  const rows = typeof text === 'string' ? readCsv(text, ctx.delimiter || null) : text;
  return importRows(rows, { ...ctx, mapping: mapping || undefined });
}
