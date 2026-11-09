// The words the core writes into files, taken from the dictionary: the
// column headers of the register, the names of kinds, statuses and payment
// methods, and the names of the files in the accountant package. The
// package is in the company's document language (lang), as the accountant
// reads it, not in the language of the interface; without lang the
// interface language is used (messages on screen).
import { schema, REGISTER_COLUMNS, LINE_COLUMNS } from '@we-invoice/core';
import { t, tIn } from '../../i18n/index.js';

const tr = (lang, key, params) => (lang ? tIn(lang, key, params) : t(key, params));
const map = (values, prefix, lang) => Object.fromEntries(values.map(v => [v, tr(lang, `${prefix}${v}`)]));

export function exportLabels(lang = null) {
  return {
    kind: map(schema.DOCUMENT_KINDS, 'document.kind.', lang),
    status: map(schema.DOCUMENT_STATUSES, 'document.status.', lang),
    payment: map(schema.PAYMENT_METHODS, 'exim.payment.', lang),
    exportState: map(['NOT_EXPORTED', 'EXPORTED', 'CHANGED_AFTER_EXPORT'], 'exim.exportState.', lang)
  };
}

export function registerHeaders(lang = null) {
  return Object.fromEntries(REGISTER_COLUMNS.map(c => [c, tr(lang, `exim.column.${c}`)]));
}

export function lineHeaders(lang = null) {
  return Object.fromEntries(LINE_COLUMNS.map(c => [c, tr(lang, `exim.lineColumn.${c}`)]));
}

export function fileNames(lang = null) {
  return { register: tr(lang, 'exim.file.register'), lines: tr(lang, 'exim.file.lines'), pohoda: 'pohoda', money: 'money-s3', omegaIssued: tr(lang, 'exim.file.omegaIssued'), omegaReceived: tr(lang, 'exim.file.omegaReceived') };
}

/** A translated reason or warning code, with the code itself when the dictionary has none. */
export function reasonText(code, lang = null) {
  const base = String(code || '').split(':')[0];
  const key = `exim.reason.${base}`;
  const text = tr(lang, key);
  return text === key ? base : text;
}

/** The message of an error for the user: its code's text, else the fallback. */
export function errorText(error, fallbackKey = 'errors.UNKNOWN') {
  const key = `errors.${(error && error.code) || ''}`;
  const text = t(key);
  return text === key ? t(fallbackKey) : text;
}
