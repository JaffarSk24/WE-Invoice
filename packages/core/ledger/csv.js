// CSV of the ledger tables for a spreadsheet or the accountant: semicolon
// separated with a decimal comma (the Slovak Excel default), quoted when
// a cell needs it, CRLF line ends and a byte order mark so Excel reads
// UTF-8. Headers come from the caller already translated.

const BOM = '﻿';

function cell(value, decimalComma) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (decimalComma && /^-?\d+(\.\d+)?$/.test(text)) text = text.replace('.', ',');
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * @param {string[]} header
 * @param {Array<Array<string|number|null>>} rows
 * @param {{decimalComma?: boolean, bom?: boolean}} [options]
 * @returns {string}
 */
export function toCsv(header, rows, { decimalComma = true, bom = true } = {}) {
  const lines = [header, ...rows].map(r => r.map(v => cell(v, decimalComma)).join(';'));
  return `${bom ? BOM : ''}${lines.join('\r\n')}\r\n`;
}
