// A new cash book: name, currency, opening balance and whether the balance
// may go below zero.
import { h } from '../../../ui/dom.js';
import { openModal } from '../../../ui/modal.js';
import { t } from '../../../i18n/index.js';
import { showToast } from '../../../ui/toast.js';
import { textField, amountField, selectField, checkboxField } from '../../../components/fields.js';
import { moneyState } from '../shared/data.js';
import { canWrite, guarded } from '../shared/write.js';
import { createCashBook } from './operations.js';

const CURRENCIES = ['EUR', 'CZK', 'USD', 'GBP', 'HUF', 'PLN', 'CHF'];

export function openBookDialog() {
  const state = moneyState();
  if (!canWrite(state)) return;
  const name = textField({ label: t('cash.book.name'), value: state.cashBooks.length ? '' : t('cash.book.defaultName'), required: true });
  const currency = selectField({ label: t('cash.book.currency'), options: CURRENCIES.map(c => ({ value: c, label: c })), value: state.company.defaults?.currency || 'EUR' });
  const opening = amountField({ label: t('cash.book.opening'), value: '0' });
  const negative = checkboxField({ label: t('cash.book.allowNegative') });
  openModal({
    title: t('cash.newBook'),
    body: h('div', { class: 'form-grid' }, name.el, currency.el, opening.el, negative.el),
    actions: [
      { label: t('common.cancel'), onClick: (m) => m.close() },
      {
        label: t('common.save'), kind: 'primary', onClick: async (m) => {
          const value = name.value().trim();
          if (!value) { name.setError(t('cash.book.nameRequired')); return; }
          m.close();
          const book = await guarded(store => createCashBook(store, {
            name: value, currency: currency.value(), openingBalance: opening.value() || '0', allowNegative: negative.value()
          }));
          if (book) showToast(t('cash.book.saved', { name: book.name }), { type: 'success' });
        }
      }
    ]
  });
}
