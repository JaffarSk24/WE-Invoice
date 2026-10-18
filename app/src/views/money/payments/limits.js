// The B2B cash limit as a sentence for the dialogs: the limit and the law
// from legislation on the payment date, the total cash on the document.
import { t } from '../../../i18n/index.js';
import { cashLimitCheck, isBusinessParty, paymentParty, getLegislation } from '@we-invoice/core';
import { contactMap } from '../shared/data.js';
import { money } from '../shared/format.js';

/** The B2B cash limit warning for a payment being typed, or null. */
export function limitWarning(state, doc, amount, date) {
  if (!doc || !amount) return null;
  const party = contactMap(state).get(doc.contactId) || paymentParty(doc);
  const check = cashLimitCheck({ amount, date, currency: doc.currency, fxRate: doc.fxRate, document: doc, b2b: isBusinessParty(party) });
  if (!check.applies) return null;
  let law = '';
  try { law = getLegislation('cashPaymentLimitB2b.law', date); } catch (e) { console.warn('No cash limit rule', e); }
  if (check.exceeded === null) return t('cash.limitUnknown', { limit: money(check.limit, 'EUR') });
  return check.exceeded ? t('cash.limitExceeded', { limit: money(check.limit, 'EUR'), law, total: money(check.total, 'EUR') }) : null;
}
