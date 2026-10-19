// The item card: name, code, barcode, unit, price entered without or with
// VAT (the other one is shown computed), VAT category and rate, category,
// description. Sections registered by other packages (stock levels, price
// levels) follow below for a saved item.
import { h, icon } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { schema, vatRatesOn } from '@we-invoice/core';
import { textField, textArea, selectField, numberField } from '../../components/fields.js';
import { formatAmount } from '../../components/decimal.js';
import { todayLocal } from '../../components/dates.js';
import { confirmDialog } from '../../ui/modal.js';
import { showToast } from '../../ui/toast.js';
import { blankItem, normalizeItem, bothPrices, UNIT_CODES } from './model.js';
import { renderItemSections } from './sections.js';
import { CURRENCIES } from '../contacts/form.js';
import { getOf, write, canWrite, companyOf, go } from '../contacts/source.js';

function rateOptions() {
  try {
    return vatRatesOn(todayLocal()).map(r => ({ value: r.rate, label: `${r.rate} %` }));
  } catch (e) {
    console.warn('VAT rates unavailable', e);
    return [{ value: '23', label: '23 %' }];
  }
}

export function renderItemForm(root, id) {
  const existing = id ? getOf('items', id) : null;
  if (id && !existing) { go('items'); return; }
  const company = companyOf();
  const nonPayer = company && company.vatMode === 'NONPAYER';
  const item = existing || blankItem({ currency: company?.defaults?.currency || 'EUR', ...(nonPayer ? { vatCategory: 'O', vatRate: null } : {}) });
  const unitOptions = UNIT_CODES.map(code => ({ value: code, label: `${t(`items.unit.${code}`)} (${code})` }));
  const f = {
    name: textField({ label: t('items.field.name'), value: item.name, required: true, attrs: { id: 'item-name' } }),
    code: textField({ label: t('items.field.code'), value: item.code || '' }),
    barcode: textField({ label: t('items.field.barcode'), value: item.barcode || '', attrs: { inputmode: 'numeric' } }),
    unit: selectField({ label: t('items.field.unit'), options: unitOptions, value: UNIT_CODES.includes(item.unit?.code) ? item.unit.code : 'C62', attrs: { id: 'item-unit' } }),
    unitLabel: textField({ label: t('items.field.unitLabel'), value: item.unit?.label || '', hint: t('items.field.unitLabelHint') }),
    price: numberField({ label: t('items.field.price'), value: item.price, required: true, attrs: { id: 'item-price' } }),
    priceType: selectField({ label: t('items.field.priceType'), options: schema.PRICE_TYPES.map(p => ({ value: p, label: t(`items.priceType.${p}`) })), value: item.priceType, attrs: { id: 'item-price-type' } }),
    vatCategory: selectField({ label: t('items.field.vatCategory'), options: schema.VAT_CATEGORIES.map(c => ({ value: c, label: t(`items.vatCategory.${c}`) })), value: item.vatCategory, attrs: { id: 'item-vat-category' } }),
    vatRate: selectField({ label: t('items.field.vatRate'), options: rateOptions(), value: item.vatRate || '23', attrs: { id: 'item-vat-rate' } }),
    currency: selectField({ label: t('contacts.field.currency'), options: CURRENCIES.map(v => ({ value: v, label: v })), value: item.currency || 'EUR' }),
    category: textField({ label: t('items.field.category'), value: item.accountingCategory || '' }),
    description: textArea({ label: t('items.field.description'), value: item.description || '' })
  };
  const preview = h('p', { class: 'muted small', id: 'item-price-preview', 'aria-live': 'polite' });

  const read = () => ({
    ...item, name: f.name.value(), code: f.code.value(), barcode: f.barcode.value(),
    unit: { code: f.unit.value(), label: f.unitLabel.value() }, price: f.price.input.value, priceType: f.priceType.value(),
    vatCategory: f.vatCategory.value(), vatRate: f.vatRate.value(), currency: f.currency.value(),
    accountingCategory: f.category.value(), description: f.description.value()
  });
  const refresh = () => {
    f.vatRate.el.hidden = f.vatCategory.value() !== 'S';
    const { item: draft, errors } = normalizeItem(read());
    if (errors.price) { preview.textContent = ''; return; }
    const p = bothPrices(draft);
    preview.textContent = t('items.price.preview', { net: formatAmount(p.net, draft.currency), gross: formatAmount(p.gross, draft.currency) });
  };
  [f.price, f.priceType, f.vatCategory, f.vatRate, f.currency].forEach(x => x.input.addEventListener('change', refresh));
  f.price.input.addEventListener('input', refresh);

  const save = async () => {
    const { item: clean, errors } = normalizeItem(read());
    Object.entries(f).forEach(([k, field]) => field.setError(errors[k] ? t(`crm.error.${errors[k]}`) : null));
    if (Object.keys(errors).length) return;
    const saved = await write(store => (existing ? store.update('items', existing.id, clean) : store.insert('items', clean)));
    if (!saved) return;
    showToast(t('items.saved'), { type: 'success' });
    go(existing ? 'items' : `items/${encodeURIComponent(saved.id)}`);
  };
  const remove = async () => {
    if (!(await confirmDialog(t('items.deleteConfirm', { name: existing.name }), { danger: true, okLabel: t('common.delete') }))) return;
    if (await write(store => store.remove('items', existing.id))) go('items');
  };

  const extra = h('div', { class: 'item-sections' });
  if (existing) renderItemSections(extra, { item: existing, readOnly: !canWrite() }, (sid) => h('section', { class: 'card item-section', dataset: { section: sid } }));
  root.append(
    h('header', { class: 'view-header' }, h('div', {},
      h('a', { href: '#/items', class: 'back-link' }, icon('arrow-left'), t('items.back')),
      h('h1', {}, existing ? existing.name : t('items.new')))),
    h('form', { class: 'card item-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); save(); } },
      h('div', { class: 'form-grid' }, f.name.el, f.code.el, f.unit.el, f.unitLabel.el, f.price.el, f.priceType.el, f.vatCategory.el, f.vatRate.el, f.currency.el, f.barcode.el, f.category.el),
      preview, f.description.el,
      h('div', { class: 'form-actions' },
        existing ? h('button', { type: 'button', class: 'btn btn-ghost', onclick: remove }, icon('x'), t('common.delete')) : null,
        h('button', { type: 'button', class: 'btn', onclick: () => go('items') }, t('common.cancel')),
        h('button', { type: 'submit', class: 'btn btn-primary', id: 'item-save' }, icon('check'), t('common.save')))),
    extra);
  refresh();
  refreshIcons(root);
}
