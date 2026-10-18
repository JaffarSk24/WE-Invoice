// CSV for the report exports (RFC 4180): fields with the separator, a
// quote or a line break are quoted, quotes doubled. The separator is a
// semicolon by default because spreadsheet programs in Slovak and Czech
// read the comma as the decimal sign; amounts can be written with a
// decimal comma for the same reason.

function cell(value, separator) {
  const text = value === null || value === undefined ? '' : String(value);
  if (text.includes(separator) || text.includes('"') || /[\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** A decimal string with a comma as the decimal sign: "1234.50" -> "1234,50". */
export function decimalComma(value) {
  return value === null || value === undefined ? '' : String(value).replace('.', ',');
}

/**
 * @param {{label: string, value: (row: object) => unknown}[]} columns
 * @param {object[]} rows
 * @param {{separator?: string}} [options]
 * @returns {string} lines joined by CRLF, with a header line
 */
export function toCsv(columns, rows, options = {}) {
  const { separator = ';' } = options;
  const lines = [columns.map(c => cell(c.label, separator)).join(separator)];
  for (const row of rows || []) lines.push(columns.map(c => cell(c.value(row), separator)).join(separator));
  return `${lines.join('\r\n')}\r\n`;
}
