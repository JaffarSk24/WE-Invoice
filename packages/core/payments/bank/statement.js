// One entry point for every statement file: the format is detected from
// the content (an XML BkToCstmrStmt is CAMT.053, ":20:" and ":61:" tags are
// MT940, "074"/"075" records are ABO/GPC, anything else is read as CSV by
// bank profile), or forced by the caller after the user picked it.
import { decodeStatement } from './csv/read.js';
import { parseCsvStatement } from './csv/statement.js';
import { parseCamt053 } from './camt053.js';
import { parseMt940 } from './mt940.js';
import { parseGpc } from './gpc.js';
import { withImportKeys } from './normalize.js';
import { CoreError } from '../../errors.js';

export const STATEMENT_FORMATS = Object.freeze(['CSV', 'CAMT053', 'MT940', 'GPC']);

/** @returns {'CSV'|'CAMT053'|'MT940'|'GPC'} */
export function detectStatementFormat(text) {
  const head = String(text ?? '').slice(0, 4000);
  if (/^\s*</.test(head)) {
    if (/BkToCstmrStmt|camt\.053/.test(head)) return 'CAMT053';
    throw new CoreError('BANK_FORMAT_UNKNOWN', 'an XML file that is not CAMT.053');
  }
  if (/(^|\n)\s*(\{[^}]*\})*:20:/.test(head) && /:61:|:60F:/.test(head)) return 'MT940';
  const lines = head.split(/\r?\n/).filter(l => l.trim());
  if (lines.length && lines.every(l => /^07[4-9]/.test(l))) return 'GPC';
  return 'CSV';
}

/**
 * Parses a statement into transactions shaped like bankTransactions
 * records (without the store fields). With options.accountId the import
 * keys are added as well.
 * @param {string|ArrayBuffer|Uint8Array} input
 * @param {{format?: string, profile?: string, mapping?: object, accountId?: string, currency?: string, country?: string, dateOrder?: string}} [options]
 * @returns {{format: string, profile: string|null, encoding: string, account: object|null, openingBalance: object|null,
 *   closingBalance: object|null, transactions: object[], warnings: string[], invalid: number, pending: number, header?: string[], mapping?: object}}
 */
export function parseBankStatement(input, options = {}) {
  const { text, encoding } = decodeStatement(input);
  if (!text.trim()) throw new CoreError('BANK_STATEMENT_EMPTY', 'the statement is empty');
  const format = options.format || detectStatementFormat(text);
  let result;
  if (format === 'CAMT053') result = parseCamt053(text, options);
  else if (format === 'MT940') result = parseMt940(text, options);
  else if (format === 'GPC') result = parseGpc(text, options);
  else if (format === 'CSV') result = { account: null, openingBalance: null, closingBalance: null, ...parseCsvStatement(text, options) };
  else throw new CoreError('BANK_FORMAT_UNKNOWN', `unknown format ${format}`);
  const transactions = options.accountId ? withImportKeys(options.accountId, result.transactions) : result.transactions;
  return { profile: null, ...result, format, encoding, transactions };
}
