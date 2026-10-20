// CSV for spreadsheets and other programs. Cells that a spreadsheet would
// run as a formula (=, +, -, @, tab, carriage return at the start) get a
// leading apostrophe, except plain numbers such as "-12.50", which must
// stay numbers (OWASP "CSV injection").

const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+([.,]\d+)?$/;

export function protectCell(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return FORMULA_START.test(s) && !PLAIN_NUMBER.test(s) ? `'${s}` : s;
}

function quote(cell, delimiter) {
  return /["\r\n]/.test(cell) || cell.includes(delimiter) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

/**
 * CSV text from rows and columns.
 * @param {Array<object>} rows
 * @param {Array<{header: string, key?: string, value?: (row: object) => any}>} columns
 * @param {{delimiter?: string, bom?: boolean, decimalComma?: boolean}} [options]
 *   decimalComma writes decimal strings with a comma, as Slovak Excel reads them.
 * @returns {string} CRLF line endings, a BOM for Excel unless bom is false
 */
export function exportCsv(rows, columns, options = {}) {
  const { delimiter = ';', bom = true, decimalComma = false } = options;
  const cell = (value) => {
    let s = protectCell(value);
    if (decimalComma && PLAIN_NUMBER.test(s)) s = s.replace('.', ',');
    return quote(s, delimiter);
  };
  const lines = [columns.map(c => quote(protectCell(c.header), delimiter)).join(delimiter)];
  for (const row of rows || []) {
    lines.push(columns.map(c => cell(c.value ? c.value(row) : row[c.key])).join(delimiter));
  }
  return `${bom ? '\ufeff' : ''}${lines.join('\r\n')}\r\n`;
}
