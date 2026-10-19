// The words the core writes into files, taken from the dictionary: the
// column headers of the register, the names of kinds, statuses and payment
// methods, and the names of the files in the accountant package.
import { schema, REGISTER_COLUMNS, LINE_COLUMNS } from '@we-invoice/core';
import { t } from '../../i18n/index.js';

const map = (values, prefix) => Object.fromEntries(values.map(v => [v, t(`${prefix}${v}`)]));

export function exportLabels() {
  return {
    kind: map(schema.DOCUMENT_KINDS, 'document.kind.'),
    status: map(schema.DOCUMENT_STATUSES, 'document.status.'),
    payment: map(schema.PAYMENT_METHODS, 'exim.payment.'),
    exportState: map(['NOT_EXPORTED', 'EXPORTED', 'CHANGED_AFTER_EXPORT'], 'exim.exportState.')
  };
}

export function registerHeaders() {
  return Object.fromEntries(REGISTER_COLUMNS.map(c => [c, t(`exim.column.${c}`)]));
}

export function lineHeaders() {
  return Object.fromEntries(LINE_COLUMNS.map(c => [c, t(`exim.lineColumn.${c}`)]));
}

export function fileNames() {
  return { register: t('exim.file.register'), lines: t('exim.file.lines'), pohoda: 'pohoda', money: 'money-s3', omegaIssued: t('exim.file.omegaIssued'), omegaReceived: t('exim.file.omegaReceived') };
}

/** A translated reason or warning code, with the code itself when the dictionary has none. */
export function reasonText(code) {
  const base = String(code || '').split(':')[0];
  const key = `exim.reason.${base}`;
  const text = t(key);
  return text === key ? base : text;
}

/** The message of an error for the user: its code's text, else the fallback. */
export function errorText(error, fallbackKey = 'errors.UNKNOWN') {
  const key = `errors.${(error && error.code) || ''}`;
  const text = t(key);
  return text === key ? t(fallbackKey) : text;
}
