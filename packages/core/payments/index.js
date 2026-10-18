// Payments, payment status and late payment interest (WP-CORE).
import { NotImplementedError } from '../errors.js';

/** @returns {'UNPAID'|'PARTIAL'|'PAID'|'OVERPAID'} */
export function paymentState(document) { throw new NotImplementedError('paymentState'); }

/** Amount still to pay. @returns {string} */
export function amountDue(document) { throw new NotImplementedError('amountDue'); }

/**
 * Úrok z omeškania (03-features.md § 3.10), parameters from legislation.
 * @param {{amount: string, dueDate: string, until: string, b2b: boolean}} input
 * @returns {{interest: string, days: number, ratePct: string, recoveryCost: string|null}}
 */
export function lateInterest(input) { throw new NotImplementedError('lateInterest'); }
