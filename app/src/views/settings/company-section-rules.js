// Checks of the company form (03-features.md § 3.17): IČO, DIČ and IČ DPH
// by the core's format rules, IBAN by mod 97, a name and a country. Each
// error is an i18n key by field; values are normalised the way they are
// stored (no spaces, upper case). Pure functions.
import { isValidIco, isValidDic, isValidVatId, isValidIban, bicFromIban } from '@we-invoice/core';

const compact = (v) => String(v ?? '').replace(/\s+/g, '');

export function normalizeCompany(values) {
  return {
    ...values,
    name: String(values.name || '').trim(),
    ico: compact(values.ico) || null,
    dic: compact(values.dic) || null,
    icDph: compact(values.icDph).toUpperCase() || null,
    registerEntry: String(values.registerEntry || '').trim() || null,
    email: String(values.email || '').trim() || null,
    phone: String(values.phone || '').trim() || null,
    web: String(values.web || '').trim() || null,
    address: {
      street: String(values.street || '').trim(), city: String(values.city || '').trim(), zip: String(values.zip || '').trim(),
      country: (String(values.country || 'SK').trim() || 'SK').toUpperCase()
    }
  };
}

/** @returns {Object<string, string>} field -> i18n key */
export function companyErrors(values) {
  const v = normalizeCompany(values);
  const errors = {};
  if (!v.name) errors.name = 'documents.company.errors.name';
  if (v.ico && !(v.address.country === 'SK' || v.address.country === 'CZ' ? isValidIco(v.ico) : /^\d{6,8}$/.test(v.ico))) errors.ico = 'documents.company.errors.ico';
  if (v.dic && v.address.country === 'SK' && !isValidDic(v.dic)) errors.dic = 'documents.company.errors.dic';
  if (v.icDph && !isValidVatId(v.icDph)) errors.icDph = 'documents.company.errors.icDph';
  if (v.vatMode !== 'NONPAYER' && !v.icDph) errors.icDph = 'documents.company.errors.icDphRequired';
  if (!/^[A-Z]{2}$/.test(v.address.country)) errors.country = 'documents.company.errors.country';
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) errors.email = 'documents.company.errors.email';
  return errors;
}

/** A bank account as stored, or { error } with the i18n key. */
export function bankAccountFrom({ id, name, iban, bic, currency, isDefault }) {
  const cleanIban = compact(iban).toUpperCase();
  if (!isValidIban(cleanIban)) return { error: 'documents.company.errors.iban' };
  const cleanBic = compact(bic).toUpperCase() || bicFromIban(cleanIban) || null;
  if (cleanBic && !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(cleanBic)) return { error: 'documents.company.errors.bic' };
  const cur = String(currency || 'EUR').toUpperCase();
  if (!/^[A-Z]{3}$/.test(cur)) return { error: 'documents.company.errors.currency' };
  return { account: { id, name: String(name || '').trim(), iban: cleanIban, bic: cleanBic, currency: cur, isDefault: Boolean(isDefault) } };
}

/** The accounts with one added or replaced; a default account takes the flag from the others of its currency. */
export function withAccount(accounts, account) {
  const list = (accounts || []).some(a => a.id === account.id) ? accounts.map(a => (a.id === account.id ? account : a)) : [...(accounts || []), account];
  const first = !list.some(a => a.isDefault && a.id !== account.id && a.currency === account.currency);
  return list.map(a => (a.id === account.id ? { ...a, isDefault: a.isDefault || first } : account.isDefault && a.currency === account.currency ? { ...a, isDefault: false } : a));
}

/** An image file as a data URL check: PNG or JPEG up to the size limit. */
export const IMAGE_MAX_BYTES = 512 * 1024;
export function imageError(file) {
  if (!file) return null;
  if (!['image/png', 'image/jpeg'].includes(file.type)) return 'documents.company.errors.imageType';
  if (file.size > IMAGE_MAX_BYTES) return 'documents.company.errors.imageSize';
  return null;
}
