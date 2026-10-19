// Closed VAT periods in the document screens: a document whose tax date
// falls into a closed period is not changed, and none is moved into one,
// until the period is opened again in the VAT records (canChangeInPeriod
// of the core tax module). The sales editor and the review of received
// documents call this before every write of a non-draft document.
import { canChangeInPeriod } from '@we-invoice/core';

/** The closed period that blocks the change, or null when it may be saved. */
export function blockingPeriod(before, after, company) {
  const check = canChangeInPeriod(before || null, after || null, company);
  return check.allowed ? null : check.period;
}

/**
 * Throws an error with code TAX_PERIOD_CLOSED (shown as
 * errors.TAX_PERIOD_CLOSED) when the change touches a closed period.
 */
export function assertPeriodOpen(before, after, company) {
  const period = blockingPeriod(before, after, company);
  if (!period) return;
  const error = new Error(`VAT period ${period} is closed`);
  error.code = 'TAX_PERIOD_CLOSED';
  error.details = { period };
  throw error;
}
