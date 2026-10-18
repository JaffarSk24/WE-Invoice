// CSV export of stock tables (levels, moves, valuation). The interface
// passes the column labels in the user's language and the rows already
// resolved to text; this module only writes valid CSV: semicolon
// separated (what Slovak spreadsheets open directly), every field quoted
// when needed, CRLF line ends and a BOM so diacritics survive in Excel.
// A cell that would start a formula is prefixed with an apostrophe.

const BOM = String.fromCharCode(0xfeff);
const FORMULA = /^[=+\-@\t\r]/;
const NUMBER = /^-?\d+(\.\d+)?$/;

function cell(value, separator) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (FORMULA.test(text) && !NUMBER.test(text)) text = `'${text}`;
  if (text.includes('"') || text.includes(separator) || /[\r\n]/.test(text) || /^\s|\s$/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * @param {Array<{id: string, label: string}>} columns
 * @param {Array<Record<string, unknown>>} rows
 * @param {{separator?: string, decimalComma?: boolean, bom?: boolean}} [options]
 *   decimalComma: write decimal numbers with a comma (Slovak Excel)
 * @returns {string}
 */
export function stockCsv(columns, rows, { separator = ';', decimalComma = true, bom = true } = {}) {
  const format = (v) => (decimalComma && typeof v === 'string' && NUMBER.test(v) ? v.replace('.', ',') : v);
  const lines = [columns.map(c => cell(c.label, separator)).join(separator)];
  for (const row of rows || []) lines.push(columns.map(c => cell(format(row[c.id]), separator)).join(separator));
  return (bom ? BOM : '') + lines.join('\r\n') + '\r\n';
}
