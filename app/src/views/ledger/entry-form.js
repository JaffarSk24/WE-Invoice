// The form of one ledger entry written by hand: a cash or bank movement
// with its column (category), VAT for a payer and, in the tax records,
// the § 6 paragraph of an income. Editing an automatic entry turns it into
// a manual one, so the automatic sync leaves it as the user set it.
import { h } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { openModal, confirmDialog } from '../../ui/modal.js';
import { showToast, showError } from '../../ui/toast.js';
import { textField, amountField, dateField, selectField } from '../../components/fields.js';
import { todayLocal } from '../../components/dates.js';
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES, INCOME_PARAGRAPHS, DEFAULT_INCOME_PARAGRAPH, categoryFits, isTaxCategory, cmp, isZero, abs } from '@we-invoice/core';
import { getStore } from '../../store/index.js';
import { canWrite } from './kit.js';
import { ledgerMode, ledgerCompany } from './state.js';

const CATEGORIES = { INCOME: INCOME_CATEGORIES, EXPENSE: EXPENSE_CATEGORIES.filter(c => c !== 'EXPENSE_UNCATEGORIZED'), TRANSFER: ['TRANSFER'] };

/** Checks the form values; returns error keys by field. Pure, for tests. */
export function entryErrors(v, { payer = false } = {}) {
  const errors = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date || '')) errors.date = 'ledger.entry.error.date';
  if (v.amount === null || v.amount === undefined || isZero(v.amount)) errors.amount = 'ledger.entry.error.amount';
  else if (v.direction === 'TRANSFER' && cmp(v.amount, '0') < 0) errors.amount = 'ledger.entry.error.transferNegative';
  if (!categoryFits(v.category, v.direction)) errors.category = 'ledger.entry.error.category';
  if (payer && v.vat !== null && v.vat !== undefined && v.amount && cmp(abs(v.vat), abs(v.amount)) > 0) errors.vat = 'ledger.entry.error.vat';
  return errors;
}

/** The record fields of the form values. */
export function entryFields(v, { payer = false, flat = false } = {}) {
  const fields = {
    date: v.date, number: v.number || null, direction: v.direction, medium: v.medium, amount: v.amount,
    vat: payer && v.direction !== 'TRANSFER' && v.vat ? v.vat : null, category: v.category,
    taxRelevant: isTaxCategory(v.category), text: v.text || null, auto: false
  };
  if (flat && v.direction === 'INCOME') fields.incomeParagraph = v.incomeParagraph || DEFAULT_INCOME_PARAGRAPH;
  return fields;
}

const options = (list, prefix) => list.map(value => ({ value, label: t(`${prefix}.${value}`) }));

/** Opens the form; entry is null for a new one. */
export function openEntryForm(entry = null) {
  if (!canWrite()) return;
  const company = ledgerCompany();
  const payer = company?.vatMode === 'PAYER';
  const flat = ledgerMode(company) === 'TAX_RECORDS_FLAT';
  let direction = entry?.direction || 'INCOME';
  const date = dateField({ label: t('ledger.entry.date'), value: entry?.date || todayLocal(), required: true });
  const dir = selectField({ label: t('ledger.entry.direction'), options: options(['INCOME', 'EXPENSE', 'TRANSFER'], 'ledger.direction'), value: direction, onChange: (v) => { direction = v; refresh(); } });
  const medium = selectField({ label: t('ledger.entry.medium'), options: options(['BANK', 'CASH'], 'ledger.medium'), value: entry?.medium || 'BANK' });
  const categoryBox = h('div', {});
  let category = null;
  const amount = amountField({ label: t('ledger.entry.amount'), value: entry?.amount || null, required: true, hint: payer ? t('ledger.entry.amountHintPayer') : null });
  const vat = amountField({ label: t('ledger.entry.vat'), value: entry?.vat || null });
  const paragraph = selectField({ label: t('ledger.entry.paragraph'), options: options(INCOME_PARAGRAPHS, 'ledger.paragraph'), value: entry?.incomeParagraph || DEFAULT_INCOME_PARAGRAPH });
  const number = textField({ label: t('ledger.entry.number'), value: entry?.number || '' });
  const text = textField({ label: t('ledger.entry.text'), value: entry?.text || '' });

  function refresh() {
    const list = CATEGORIES[direction];
    const current = category ? category.value() : entry?.category;
    category = selectField({ label: t('ledger.entry.category'), options: options(list, 'ledger.category'), value: list.includes(current) ? current : list[0] });
    categoryBox.replaceChildren(category.el);
    medium.el.querySelector('label').textContent = direction === 'TRANSFER' ? t('ledger.entry.mediumFrom') : t('ledger.entry.medium');
    vat.el.hidden = !payer || direction === 'TRANSFER';
    paragraph.el.hidden = !flat || direction !== 'INCOME';
  }
  refresh();

  const body = h('div', { class: 'form-grid ledger-form' },
    entry?.auto ? h('p', { class: 'callout callout-warning' }, t('ledger.entry.autoEditHint')) : null,
    date.el, dir.el, medium.el, categoryBox, amount.el, vat.el, paragraph.el, number.el, text.el);

  const values = () => ({
    date: date.value(), direction, medium: medium.value(), category: category.value(), amount: amount.value(),
    vat: vat.value(), incomeParagraph: paragraph.value(), number: number.value(), text: text.value()
  });

  async function save(modal) {
    const v = values();
    const errors = entryErrors(v, { payer });
    const fields = { date, amount, category, vat };
    Object.entries(fields).forEach(([name, f]) => f.setError(errors[name] ? t(errors[name]) : null));
    if (Object.keys(errors).length) return;
    try {
      const store = getStore();
      const record = entryFields(v, { payer, flat });
      if (entry) await store.update('ledgerEntries', entry.id, record);
      else await store.insert('ledgerEntries', record);
      showToast(t('ledger.entry.saved'), { type: 'success' });
      modal.close();
    } catch (e) {
      showError(e, 'ledger.entry.error.save');
    }
  }

  async function remove(modal) {
    if (!(await confirmDialog(t('ledger.entry.confirmDelete'), { danger: true, okLabel: t('common.delete') }))) return;
    try {
      await getStore().remove('ledgerEntries', entry.id);
      modal.close();
    } catch (e) {
      showError(e, 'ledger.entry.error.save');
    }
  }

  const actions = [{ label: t('common.cancel'), onClick: (m) => m.close() }];
  if (entry && !entry.auto) actions.unshift({ label: t('common.delete'), onClick: remove });
  actions.push({ label: t('common.save'), kind: 'primary', onClick: save });
  openModal({ title: entry ? t('ledger.entry.editTitle') : t('ledger.entry.newTitle'), body, actions });
}
