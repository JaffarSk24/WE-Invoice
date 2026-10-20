// Errors of the eFaktúra module. Each carries a stable code that the
// interface translates as errors.<code>; `retryable` tells the send queue
// whether trying again later can help (network, 5xx, rate limit) or not
// (rejected document, wrong key). Messages are for the console and never
// contain an API key.

export class PeppolError extends Error {
  constructor(code, message, { status = null, retryable = false, detail = null, retryAfterMs = null } = {}) {
    super(message || code);
    this.name = 'PeppolError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.detail = detail;
    this.retryAfterMs = retryAfterMs;
  }
}

export const PEPPOL_ERROR_CODES = Object.freeze([
  'PEPPOL_NETWORK', 'PEPPOL_AUTH', 'PEPPOL_VALIDATION', 'PEPPOL_RATE_LIMIT', 'PEPPOL_SERVER', 'PEPPOL_NOT_FOUND',
  'PEPPOL_NOT_CONFIGURED', 'PEPPOL_BAD_RESPONSE', 'PEPPOL_BETA_REQUIRED', 'PEPPOL_NO_PROVIDER', 'PEPPOL_NO_CREDENTIALS',
  'PEPPOL_ARCHIVE_UNAVAILABLE', 'PEPPOL_NOT_ALLOWED', 'PEPPOL_READ_ONLY', 'PEPPOL_UNSUPPORTED', 'PEPPOL_BETA_CODE_INVALID', 'PEPPOL_ATTACHMENT_MISSING'
]);

function retryAfter(headers) {
  const value = headers && (headers['retry-after'] || headers['Retry-After']);
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
}

/**
 * Error of an HTTP answer that is not ok. `body` is the parsed answer when
 * there is one: its error text (provider language) goes to `detail` so the
 * user sees why the provider refused the document.
 */
export function errorFromResponse(response, body, context) {
  const status = response.status;
  const detail = providerMessage(body);
  const where = `${context} answered ${status}`;
  // The gateway refuses a provider whose API address it does not know yet.
  const gatewayCode = body && body.error && body.error.code;
  if (gatewayCode === 'PROVIDER_NOT_CONFIGURED' || gatewayCode === 'HOST_NOT_ALLOWED') return new PeppolError('PEPPOL_NOT_CONFIGURED', where, { status, detail });
  if (status === 401 || status === 403) return new PeppolError('PEPPOL_AUTH', where, { status, detail });
  if (status === 404) return new PeppolError('PEPPOL_NOT_FOUND', where, { status, detail });
  if (status === 400 || status === 409 || status === 413 || status === 422) return new PeppolError('PEPPOL_VALIDATION', where, { status, detail });
  if (status === 429) return new PeppolError('PEPPOL_RATE_LIMIT', where, { status, detail, retryable: true, retryAfterMs: retryAfter(response.headers) });
  if (status >= 500) return new PeppolError('PEPPOL_SERVER', where, { status, detail, retryable: true, retryAfterMs: retryAfter(response.headers) });
  return new PeppolError('PEPPOL_BAD_RESPONSE', where, { status, detail });
}

// The readable part of a provider error: SAPI-SK and most providers answer
// { error: { code, message, field } }, some { message } or { errors: [...] }.
export function providerMessage(body) {
  if (!body || typeof body !== 'object') return typeof body === 'string' && body.length < 500 ? body : null;
  const e = body.error && typeof body.error === 'object' ? body.error : body;
  const parts = [];
  if (e.message) parts.push(String(e.message));
  if (Array.isArray(body.errors)) body.errors.slice(0, 5).forEach(x => parts.push(typeof x === 'string' ? x : (x && (x.message || x.text)) || ''));
  if (e.rule) parts.unshift(String(e.rule));
  if (e.field) parts.push(`(${e.field})`);
  const text = parts.filter(Boolean).join(' ').trim();
  return text ? text.slice(0, 1000) : null;
}

export function networkError(error, context) {
  return new PeppolError('PEPPOL_NETWORK', `${context}: ${error && (error.code || error.name || error.message)}`, { retryable: true });
}
