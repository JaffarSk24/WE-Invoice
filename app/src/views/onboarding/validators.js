// Identifier checks for the wizard, on top of the core validators
// (WP-CORE). While a core validator is still a stub, the check answers
// null ("unknown"): the field is accepted as typed and the user is told
// it was not verified, instead of being blocked.
// Named imports keep the rest of the core out of the start-up bundle.
import { isValidIco, isValidIban, bicFromIban } from '@we-invoice/core';

function tryCore(fn, ...args) {
  try {
    return fn(...args);
  } catch (e) {
    if (e && e.code === 'NOT_IMPLEMENTED') return null;
    throw e;
  }
}

/** @returns {boolean|null} */
export function checkIco(ico) {
  if (!/^\d{6,8}$/.test(ico)) return false;
  return tryCore(isValidIco, ico);
}

/** @returns {boolean|null} */
export function checkIban(iban) {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(iban)) return false;
  return tryCore(isValidIban, iban);
}

/** @returns {string|null} BIC when the core knows the bank */
export function suggestBic(iban) {
  const bic = tryCore(bicFromIban, iban);
  return typeof bic === 'string' && bic ? bic : null;
}
