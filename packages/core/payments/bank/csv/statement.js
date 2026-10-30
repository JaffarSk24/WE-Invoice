// A CSV statement to transactions: delimiter, header row, bank profile,
// column mapping, then one transaction per booked row. Rows without a date
// or an amount are counted as invalid, unfinished card payments (a state
// column that is not "completed") as pending, zero amounts are skipped. An
// unsigned amount takes its sign from a Debet/Kredit column (direction).
import { parseCsv, detectDelimiter, detectHeaderRow } from './read.js';
import { detectProfiles, isProfileHeader, columnMapping, mappingUsable, profileById, headerName, COMPLETED_STATES, DEBIT_MARKS, CREDIT_MARKS } from './profiles.js';
import { parseStatementDate, parseStatementAmount, detectDateOrder } from '../values.js';
import { normalizeTransaction } from '../normalize.js';
import { sub, abs, neg, round, isZero } from '../../../money/index.js';

const cellAt = (row, i) => String(row[i] ?? '').trim();
const first = (row, indexes = []) => {
  for (const i of indexes) {
    const v = cellAt(row, i);
    if (v) return v;
  }
  return '';
};

function headerIndexOf(table) {
  const known = table.slice(0, 40).findIndex(isProfileHeader);
  return known >= 0 ? known : detectHeaderRow(table);
}

// An amount printed without a sign next to a Debet or Kredit column.
function signed(amount, row, mapping) {
  if (amount === null || !mapping.direction?.length) return amount;
  const mark = headerName(first(row, mapping.direction));
  if (DEBIT_MARKS.includes(mark)) return round(neg(abs(amount)), 2);
  if (CREDIT_MARKS.includes(mark)) return round(abs(amount), 2);
  return amount;
}

function amountOf(row, mapping) {
  if (mapping.amount.length) return signed(parseStatementAmount(first(row, mapping.amount)), row, mapping);
  const debit = parseStatementAmount(first(row, mapping.debit));
  const credit = parseStatementAmount(first(row, mapping.credit));
  if (debit === null && credit === null) return null;
  return round(sub(abs(credit ?? '0'), abs(debit ?? '0')), 2);
}

/**
 * @param {string} text
 * @param {{profile?: string, mapping?: Record<string, number>, currency?: string, country?: string, dateOrder?: string}} [options]
 * @returns {{format: 'CSV', profile: string, header: string[], headerIndex: number, delimiter: string,
 *   mapping: Record<string, number[]>, transactions: object[], warnings: string[], invalid: number, pending: number}}
 */
export function parseCsvStatement(text, options = {}) {
  const delimiter = options.delimiter || detectDelimiter(text);
  const table = parseCsv(text, delimiter);
  const headerIndex = headerIndexOf(table);
  const header = (table[headerIndex] || []).map(c => String(c).trim());
  const detected = detectProfiles(header);
  const profile = options.profile || detected[0] || 'generic';
  const mapping = columnMapping(header, profile, options.mapping);
  const warnings = [];
  if (!mappingUsable(mapping)) {
    return { format: 'CSV', profile, header, headerIndex, delimiter, mapping, transactions: [], warnings: ['BANK_CSV_COLUMNS_MISSING'], invalid: 0, pending: 0 };
  }
  const meta = profile === 'generic' ? {} : profileById(profile);
  const body = table.slice(headerIndex + 1);
  const order = options.dateOrder || meta.dateOrder || detectDateOrder(body.map(r => first(r, mapping.date)));
  const country = options.country || meta.country || 'SK';
  const transactions = [];
  let invalid = 0;
  let pending = 0;
  body.forEach((row, i) => {
    if (!row.some(c => String(c).trim())) return;
    if (mapping.state.length) {
      const state = headerName(first(row, mapping.state));
      if (!COMPLETED_STATES.includes(state)) { pending++; return; }
    }
    const date = parseStatementDate(first(row, mapping.date), order);
    const amount = amountOf(row, mapping);
    if (!date || amount === null) { invalid++; return; }
    if (isZero(amount)) return;
    const fee = parseStatementAmount(first(row, mapping.fee));
    transactions.push(normalizeTransaction({
      line: headerIndex + 2 + i,
      date,
      valueDate: parseStatementDate(first(row, mapping.valueDate), order),
      amount,
      currency: first(row, mapping.currency) || options.currency,
      counterpartyName: first(row, mapping.counterpartyName),
      counterpartyAccount: first(row, mapping.counterpartyAccount),
      counterpartyBankCode: first(row, mapping.counterpartyBankCode),
      vs: first(row, mapping.vs),
      ks: first(row, mapping.ks),
      ss: first(row, mapping.ss),
      symbols: first(row, mapping.symbols),
      message: first(row, mapping.message),
      ref: first(row, mapping.ref),
      fee: fee && !isZero(fee) ? round(abs(fee), 2) : null
    }, { currency: options.currency, country }));
  });
  if (invalid) warnings.push('BANK_ROWS_INVALID');
  if (pending) warnings.push('BANK_ROWS_PENDING');
  return { format: 'CSV', profile, header, headerIndex, delimiter, mapping, transactions, warnings, invalid, pending };
}
