// Text helpers of the bank module: comparison without case and diacritics,
// the Slovak and Czech payment symbols (VS, KS, SS) hidden in references
// and messages, and IBANs built from domestic account numbers. Statements
// of SK and CZ banks carry the symbols in many shapes ("/VS123/SS/KS0308",
// "VS: 123", "VS123"), so the matching needs one reader for all of them.
import { isValidIban } from '../../ids/index.js';

/** Lower case, no diacritics, single spaces. */
export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** IBAN without spaces in upper case, or null when it is not a valid one. */
export function compactIban(value) {
  const s = String(value ?? '').replace(/[\s-]/g, '').toUpperCase();
  return s && isValidIban(s) ? s : null;
}

/** Digits only, leading zeros removed ("0000012345" -> "12345"); null when empty. */
export function symbolDigits(value, maxLength = 10) {
  const digits = String(value ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (!digits || /^0+$/.test(digits)) return null;
  return digits.length > maxLength ? null : digits;
}

const SYMBOL_LENGTH = { vs: 10, ks: 4, ss: 10 };

/**
 * Payment symbols found in a text: the SEPA end-to-end form used by Slovak
 * banks ("/VS2026001/SS/KS0308") and labelled forms ("VS: 2026001",
 * "v.s. 2026001", "VS2026001"). A symbol given in its own column wins over
 * the text; the caller merges.
 * @returns {{vs: string|null, ks: string|null, ss: string|null}}
 */
export function parseSymbols(text) {
  const out = { vs: null, ks: null, ss: null };
  const s = String(text ?? '');
  const slash = /\/(VS|KS|SS)(\d*)(?=\/|\s|$)/gi;
  let m;
  while ((m = slash.exec(s))) {
    const key = m[1].toLowerCase();
    if (!out[key]) out[key] = symbolDigits(m[2], SYMBOL_LENGTH[key]);
  }
  const labelled = /(?:^|[^A-Za-z])(V|K|S)\.?\s?S\.?\s*[:=#]?\s*(\d{1,10})(?!\d)/gi;
  while ((m = labelled.exec(s))) {
    const key = `${m[1].toLowerCase()}s`;
    if (!out[key]) out[key] = symbolDigits(m[2], SYMBOL_LENGTH[key]);
  }
  return out;
}

// ISO 7064 mod 97 over a digit string of any length.
function mod97(digits) {
  let r = 0;
  for (const ch of digits) r = (r * 10 + Number(ch)) % 97;
  return r;
}

/**
 * IBAN of a Slovak or Czech domestic account ("prefix-number/bank"): both
 * countries use the same BBAN of bank code (4), prefix (6) and number (10).
 * @returns {string|null}
 */
export function ibanFromDomestic(country, account, bankCode = null) {
  const cc = String(country || '').toUpperCase();
  if (cc !== 'SK' && cc !== 'CZ') return null;
  const m = /^\s*(?:(\d{1,6})-)?(\d{1,10})(?:\s*\/\s*(\d{4}))?\s*$/.exec(String(account ?? ''));
  if (!m) return null;
  const bank = m[3] || (bankCode ? String(bankCode).trim() : '');
  if (!/^\d{4}$/.test(bank)) return null;
  const bban = bank + (m[1] || '').padStart(6, '0') + m[2].padStart(10, '0');
  const letters = cc.split('').map(c => String(c.charCodeAt(0) - 55)).join('');
  const check = String(98 - mod97(`${bban}${letters}00`)).padStart(2, '0');
  const iban = `${cc}${check}${bban}`;
  return isValidIban(iban) ? iban : null;
}

/** Counterparty IBAN from whatever the statement gives: an IBAN or a domestic number. */
export function counterpartyIban(value, bankCode, country) {
  const iban = compactIban(value);
  if (iban) return iban;
  return value ? ibanFromDomestic(country, value, bankCode) : null;
}

// FNV-1a, twice with different seeds: 16 hex characters.
function fnv(text, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Short stable hash of a text (import keys, message ids). */
export function shortHash(text) {
  const s = String(text ?? '');
  return fnv(s, 2166136261) + fnv(s, 33554467);
}
