// When to try again: exponential back-off for sending after a network or
// server failure, and for asking the provider about delivery. A provider's
// Retry-After wins when it asks for more patience.

const MINUTE = 60 * 1000;
export const MAX_SEND_ATTEMPTS = 8;
export const STATUS_CHECK_DAYS = 7;

/** Delay before attempt number `attempt` (1 = the first retry). */
export function sendBackoffMs(attempt, retryAfterMs = null) {
  const base = Math.min(2 ** Math.max(0, attempt - 1) * MINUTE, 6 * 60 * MINUTE);
  return Math.max(base, retryAfterMs || 0);
}

/** Delay before the next delivery check: 1, 2, 4 ... minutes, at most an hour. */
export function statusBackoffMs(checks) {
  return Math.min(2 ** Math.max(0, checks) * MINUTE, 60 * MINUTE);
}

export function addMs(iso, ms) {
  return new Date(new Date(iso).getTime() + ms).toISOString();
}

export function isDue(iso, nowIso) {
  return !iso || iso <= nowIso;
}
