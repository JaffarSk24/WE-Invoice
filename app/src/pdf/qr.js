// Which payment QR a document gets, if any (03-features.md § 3.7): only a
// document that asks for a payment (invoice, proforma, debit note,
// reminder) paid by transfer, with an amount still due and a Slovak or
// Czech account. A credit note never carries a QR, nor does a document
// that is already paid. The encoding itself is in the core.
import { paymentQr } from '@we-invoice/core';
import { isZero } from './amounts.js';

export const QR_KINDS = new Set(['INVOICE', 'PROFORMA', 'DEBIT_NOTE', 'REMINDER']);
const QR_METHODS = new Set(['TRANSFER', 'QR_ON_SITE', 'ONLINE', null, undefined]);

/** The bank account the document is paid to: by id, else the default, else the first in the currency. */
export function bankAccountFor(document, company, override = null) {
  if (override) return override;
  const accounts = (company && company.bankAccounts) || [];
  if (!accounts.length) return null;
  return accounts.find(a => a.id === document.bankAccountId)
    || accounts.find(a => a.isDefault && a.currency === document.currency)
    || accounts.find(a => a.currency === document.currency)
    || accounts.find(a => a.isDefault)
    || accounts[0];
}

/**
 * @returns {{format: string, text: string}|null}
 */
export function documentQr(document, bank, due, options = {}) {
  if (options.qr === false) return null;
  if (!QR_KINDS.has(document.kind) || !bank || !bank.iban) return null;
  if (!QR_METHODS.has(document.paymentMethod)) return null;
  if (isZero(due)) return null;
  try {
    return paymentQr({
      iban: bank.iban,
      bic: bank.bic || undefined,
      amount: due,
      currency: document.currency || 'EUR',
      vs: document.vs || undefined,
      ks: document.ks || undefined,
      ss: document.ss || undefined,
      dueDate: document.dueDate || undefined,
      note: document.number ? `${options.noteLabel || ''} ${document.number}`.trim() : undefined,
      beneficiary: document.seller && document.seller.name,
      invoiceId: document.number || undefined
    });
  } catch (e) {
    // A QR that cannot be built must not block the document; the PDF is
    // printed without it and the reason goes to the console.
    console.warn('Payment QR skipped', e);
    return null;
  }
}
