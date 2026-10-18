// Bank statements, matching, SEPA payments, the cash book, offsets and
// the eKasa helper (WP-BANK). Each concern lives in its own file; this
// one only gathers the public API, which packages/core/index.js re-exports.
export { parseBankStatement, detectStatementFormat, STATEMENT_FORMATS } from './statement.js';
export { BANK_PROFILES } from './csv/profiles.js';
export { withImportKeys, splitDuplicates } from './normalize.js';
export { parseSymbols, ibanFromDomestic } from './text.js';
export { matchBankTx, matchStatement, PRESELECT_FROM, CONFIDENCE as MATCH_CONFIDENCE, directionOf as bankTxDirection } from './match/index.js';
export { makePayment, addPayment, removePayments, applyMatch, unapplyMatch, statusAfterPayments } from './apply.js';
import { NotImplementedError } from '../../errors.js';

export function buildPain001(payments, debtor) { throw new NotImplementedError('buildPain001'); }
