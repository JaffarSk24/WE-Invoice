// Supplier identifiers found in a document, sorted into IČO, DIČ and
// IČ DPH by their checksums, never by the label alone: a label printed
// next to the wrong number is common on real invoices.
import { isValidIco, isValidDic, isValidVatId, isValidIban } from '../../ids/index.js';

const compact = (value) => String(value ?? '').replace(/[\s-]/g, '').toUpperCase();

/** 'ico' | 'dic' | 'icDph' | null for one identifier. */
export function classifyId(value) {
  const s = compact(value);
  if (/^[A-Z]{2}[0-9A-Z]{2,13}$/.test(s) && isValidVatId(s)) return 'icDph';
  if (/^\d{10}$/.test(s) && isValidDic(s)) return 'dic';
  if (/^\d{6,8}$/.test(s) && isValidIco(s)) return 'ico';
  return null;
}

export function normalizeId(kind, value) {
  const s = compact(value);
  if (kind === 'ico') return s.padStart(8, '0');
  return s;
}

/** True when an identifier or IBAN belongs to the user's own company. */
export function isOwn(company, kind, value) {
  if (!company || !value) return false;
  const s = compact(value);
  if (kind === 'iban') return (company.bankAccounts || []).some(a => compact(a.iban) === s);
  const own = compact(company[kind]);
  if (!own) return false;
  return kind === 'ico' ? own.padStart(8, '0') === s.padStart(8, '0') : own === s;
}

export function normalizeIban(value) {
  const s = compact(value);
  return isValidIban(s) ? s : null;
}
