// Exports for accountants and other programs (WP-EXIM).
import { NotImplementedError } from '../errors.js';

export function exportPohoda(data, ctx) { throw new NotImplementedError('exportPohoda'); }
export function exportMoneyS3(data, ctx) { throw new NotImplementedError('exportMoneyS3'); }
export function exportOmega(data, ctx) { throw new NotImplementedError('exportOmega'); }
/** CSV with protection against formula injection. */
export function exportCsv(rows, columns) { throw new NotImplementedError('exportCsv'); }
export function exportWeBudgetCsv(data, ctx) { throw new NotImplementedError('exportWeBudgetCsv'); }
