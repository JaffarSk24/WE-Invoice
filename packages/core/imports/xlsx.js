// Reading the first sheet (or a named one) of an XLSX file into rows of
// text, as the migration importers need it: iDoklad and KROS export
// spreadsheets. Shared strings, inline strings, numbers and booleans are
// read; a number in a cell formatted as a date becomes "YYYY-MM-DD".
// Numbers keep the text Excel stored, so amounts never pass a float.
import { CoreError } from '../errors.js';
import { readZip } from './zip.js';
import { parseXml, child, children, descendants } from './xml.js';

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

function xmlOf(files, name) {
  const bytes = files.get(name);
  return bytes ? parseXml(new TextDecoder('utf-8').decode(bytes)) : null;
}

function textOf(node) {
  // A rich text string is a list of runs <r><t>..</t></r>.
  return descendants(node, 't').map(t => t.text).join('') || (child(node, 't') || node).text || '';
}

function dateStyles(styles) {
  const custom = new Map(descendants(styles, 'numFmt').map(f => [Number(f.attrs.numFmtId), f.attrs.formatCode || '']));
  const xfs = child(child(styles, 'cellXfs') || { children: [] }, 'xf') ? children(child(styles, 'cellXfs'), 'xf') : [];
  return xfs.map(xf => {
    const id = Number(xf.attrs.numFmtId || 0);
    if (BUILTIN_DATE_FORMATS.has(id)) return true;
    const code = (custom.get(id) || '').replace(/"[^"]*"|\[[^\]]*\]/g, '');
    return /[dy]/i.test(code) && !/^[#0.,\s%]*$/.test(code);
  });
}

// Excel serial day (1900 system, with its 1900 leap year bug) to ISO date.
export function serialToDate(serial) {
  const days = Math.floor(Number(serial));
  if (!Number.isFinite(days) || days < 1) return null;
  const ms = Date.UTC(1899, 11, 30) + days * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

function columnIndex(ref) {
  const letters = /^[A-Z]+/.exec(ref || '');
  if (!letters) return -1;
  return [...letters[0]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}

/**
 * @param {Uint8Array} bytes
 * @param {{sheet?: string}} [options]
 * @returns {Promise<{sheets: string[], rows: string[][]}>}
 */
export async function readXlsx(bytes, options = {}) {
  const files = await readZip(bytes);
  const workbook = xmlOf(files, 'xl/workbook.xml');
  if (!workbook) throw new CoreError('IMPORT_FILE_DAMAGED', 'not an XLSX workbook');
  const sheets = descendants(workbook, 'sheet');
  const rels = xmlOf(files, 'xl/_rels/workbook.xml.rels');
  const targets = new Map(descendants(rels, 'Relationship').map(r => [r.attrs.Id, r.attrs.Target]));
  const chosen = sheets.find(s => s.attrs.name === options.sheet) || sheets[0];
  if (!chosen) throw new CoreError('IMPORT_FILE_DAMAGED', 'the workbook has no sheet');
  const relId = chosen.attrs['r:id'] || Object.entries(chosen.attrs).find(([k]) => k.endsWith(':id'))?.[1];
  const target = (targets.get(relId) || 'worksheets/sheet1.xml').replace(/^\/?xl\//, '').replace(/^\//, '');
  const sheet = xmlOf(files, `xl/${target}`);
  if (!sheet) throw new CoreError('IMPORT_FILE_DAMAGED', `missing sheet ${target}`);
  const shared = descendants(xmlOf(files, 'xl/sharedStrings.xml'), 'si').map(textOf);
  const styles = xmlOf(files, 'xl/styles.xml');
  const isDate = styles ? dateStyles(styles) : [];

  const rows = [];
  for (const row of descendants(sheet, 'row')) {
    const r = Number(row.attrs.r || rows.length + 1) - 1;
    const values = [];
    children(row, 'c').forEach((c, i) => {
      const col = c.attrs.r ? columnIndex(c.attrs.r) : i;
      const v = child(c, 'v');
      let value;
      switch (c.attrs.t) {
        case 's': value = shared[Number(v && v.text)] ?? ''; break;
        case 'inlineStr': value = textOf(child(c, 'is') || c); break;
        case 'b': value = v && v.text === '1' ? 'TRUE' : 'FALSE'; break;
        case 'str': case 'e': value = v ? v.text : ''; break;
        default:
          value = v ? v.text.trim() : '';
          if (value && isDate[Number(c.attrs.s || 0)]) value = serialToDate(value) || value;
      }
      values[col] = value;
    });
    rows[r] = Array.from(values, x => x ?? '');
  }
  return { sheets: sheets.map(s => s.attrs.name), rows: Array.from(rows, x => x || []) };
}
