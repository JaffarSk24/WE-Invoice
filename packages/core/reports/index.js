// Reports and analytics (WP-REPORTS).
import { NotImplementedError } from '../errors.js';

export function salesReport(documents, ctx) { throw new NotImplementedError('salesReport'); }
/** Receivables by age: 1-15, 16-30, 31-60, 60+ days. */
export function agingReport(documents, today) { throw new NotImplementedError('agingReport'); }
export function cashflowForecast(data, ctx) { throw new NotImplementedError('cashflowForecast'); }
export function searchIndex(data) { throw new NotImplementedError('searchIndex'); }
