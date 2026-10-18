// Bookkeeping for sole traders: peňažný denník, books, assets (WP-LEDGER).
import { NotImplementedError } from '../errors.js';

/** Ledger entries that a payment creates. @returns {object[]} */
export function entriesForPayment(document, payment, company) { throw new NotImplementedError('entriesForPayment'); }
/** Peňažný denník of a year with column totals. */
export function cashJournal(entries, year) { throw new NotImplementedError('cashJournal'); }
/** Tax depreciation plan (§ 27, 28 ZDP). */
export function depreciationPlan(asset, ctx) { throw new NotImplementedError('depreciationPlan'); }
/** Flat-rate expenses for the year (§ 6 ods. 10 ZDP). */
export function flatExpenses(income, ctx) { throw new NotImplementedError('flatExpenses'); }
