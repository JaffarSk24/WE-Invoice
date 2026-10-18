// A minimal XLSX (Office Open XML SpreadsheetML) writer: one or more
// sheets of text and numbers, a bold header row, inline strings, no
// dependency. Numbers stay decimal strings all the way into the file, so
// no amount passes through a float. Enough for the document register and
// any table an accountant opens in Excel or LibreOffice.
import { escapeXml } from './xml.js';
import { buildZip } from './zip.js';

const DECIMAL = /^-?\d+(\.\d+)?$/;

function columnName(index) {
  let n = index + 1;
  let name = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    name = String.fromCharCode(65 + r) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

// A cell is a string (text), or { value, type: 'number' } for a decimal string.
function cellXml(cell, ref, style) {
  if (cell === null || cell === undefined || cell === '') return '';
  const s = style ? ' s="1"' : '';
  if (typeof cell === 'object' && cell.type === 'number' && DECIMAL.test(String(cell.value))) {
    return `<c r="${ref}"${s}><v>${cell.value}</v></c>`;
  }
  const text = typeof cell === 'object' ? String(cell.value ?? '') : String(cell);
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
}

function sheetXml(rows) {
  const body = rows.map((row, r) => {
    const cells = row.map((cell, c) => cellXml(cell, `${columnName(c)}${r + 1}`, r === 0)).join('');
    return `<row r="${r + 1}">${cells}</row>`;
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    + `<sheetData>${body}</sheetData></worksheet>`;
}

const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
  + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
  + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
  + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
  + '</styleSheet>';

// Sheet names: at most 31 characters, none of []:*?/\ .
function sheetName(name, i) {
  const clean = String(name || `Sheet${i + 1}`).replace(/[[\]:*?/\\]/g, ' ').slice(0, 31).trim();
  return clean || `Sheet${i + 1}`;
}

/**
 * @param {Array<{name: string, rows: Array<Array<string|{value: string, type: 'number'}>>}>} sheets
 * @param {{time?: string}} [options]
 * @returns {Promise<Uint8Array>}
 */
export async function buildXlsx(sheets, options = {}) {
  const names = sheets.map((s, i) => sheetName(s.name, i));
  const files = [
    {
      name: '[Content_Types].xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
        + '</Types>'
    },
    {
      name: '_rels/.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
    },
    {
      name: 'xl/workbook.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
        + names.map((n, i) => `<sheet name="${escapeXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
        + '</sheets></workbook>'
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
        + `<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
        + '</Relationships>'
    },
    { name: 'xl/styles.xml', data: STYLES },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s.rows || []) }))
  ];
  return buildZip(files, options);
}
