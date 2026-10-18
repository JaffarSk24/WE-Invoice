// Bank statements, matching, SEPA payments, the cash book, offsets and
// the eKasa helper (WP-BANK). Each concern lives in its own file; this
// one only gathers the public API, which packages/core/index.js re-exports.
export { parseBankStatement, detectStatementFormat, STATEMENT_FORMATS } from './statement.js';
export { BANK_PROFILES } from './csv/profiles.js';
export { withImportKeys, splitDuplicates } from './normalize.js';
export { parseSymbols, ibanFromDomestic } from './text.js';
import { NotImplementedError } from '../../errors.js';

export function matchBankTx(tx, documents, contacts) { throw new NotImplementedError('matchBankTx'); }
export function buildPain001(payments, debtor) { throw new NotImplementedError('buildPain001'); }
