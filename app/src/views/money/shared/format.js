// Formatting shared by the money screens: amounts and dates in the user's
// language, a signed amount cell, and copying a value to the clipboard.
import { h } from '../../../ui/dom.js';
import { formatAmount } from '../../../components/decimal.js';
import { formatDate } from '../../../components/dates.js';
import { t } from '../../../i18n/index.js';
import { showToast } from '../../../ui/toast.js';

export const money = (amount, currency = 'EUR') => formatAmount(amount || '0', currency || 'EUR');
export const day = (date) => formatDate(date);

/** An amount cell coloured by sign (the sign is also written, never colour alone). */
export function amountCell(amount, currency) {
  const negative = String(amount).startsWith('-');
  return h('span', { class: negative ? 'money-out' : 'money-in' }, money(amount, currency));
}

export async function copyText(value) {
  try {
    await navigator.clipboard.writeText(String(value));
    showToast(t('bank.ekasa.copied', { value }), { type: 'success', duration: 2500 });
  } catch (e) {
    console.warn('Clipboard is not available', e);
    showToast(t('bank.ekasa.copyFailed'), { type: 'error' });
  }
}
