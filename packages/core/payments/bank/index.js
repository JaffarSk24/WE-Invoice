// Bank statements: parsing (CSV profiles, CAMT.053, MT940, ABO/GPC), matching
// with documents, SEPA pain.001 (WP-BANK).
import { NotImplementedError } from '../../errors.js';

/** @returns {{format: string, transactions: object[], warnings: string[]}} */
export function parseBankStatement(text, options = {}) { throw new NotImplementedError('parseBankStatement'); }

/**
 * Match suggestions for one transaction (VS + amount 100, IBAN + amount 90,
 * number in message 80, amount + name 60).
 * @returns {Array<{docId: string, confidence: number, reason: string}>}
 */
export function matchBankTx(tx, documents, contacts) { throw new NotImplementedError('matchBankTx'); }

/** SEPA credit transfer XML. @returns {string} */
export function buildPain001(payments, debtor) { throw new NotImplementedError('buildPain001'); }
