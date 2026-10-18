// VAT records and reports: evidencia DPH, KV, SV, priznanie (WP-TAX).
import { NotImplementedError } from '../errors.js';

/** Evidencia DPH (§ 70) for a period. */
export function vatRecords(documents, period, company) { throw new NotImplementedError('vatRecords'); }
/** Kontrolný výkaz. @returns {{rows: object, problems: object[], xml: string}} */
export function buildKv(records, ctx) { throw new NotImplementedError('buildKv'); }
/** Súhrnný výkaz. */
export function buildSv(records, ctx) { throw new NotImplementedError('buildSv'); }
/** Priznanie k DPH. */
export function buildVatReturn(records, ctx) { throw new NotImplementedError('buildVatReturn'); }
/** Turnover of the last 12 months against the registration limit. */
export function registrationTurnover(documents, date) { throw new NotImplementedError('registrationTurnover'); }
