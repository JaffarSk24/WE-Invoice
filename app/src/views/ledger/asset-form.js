// The card of one fixed asset: what it is, when it was put into use, its
// cost, depreciation group and method, a disposal date, and the tax plan
// (with the accounting plan next to it) recomputed while the user types.
// The plan is stored on the asset, keeping the years already booked.
import { depreciationPlan, accountingPlan, CoreError } from '@we-invoice/core';
import { h, clear } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { openModal, confirmDialog } from '../../ui/modal.js';
import { showToast, showError } from '../../ui/toast.js';
import { textField, numberField, amountField, dateField, selectField } from '../../components/fields.js';
import { todayLocal } from '../../components/dates.js';
import { getStore } from '../../store/index.js';
import { money, canWrite } from './kit.js';

const GROUPS = [0, 1, 2, 3, 4, 5, 6];

/** Checks the form; returns error keys by field. Pure, for tests. */
export function assetErrors(v) {
  const errors = {};
  if (!String(v.name || '').trim()) errors.name = 'ledger.asset.error.name';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.acquiredOn || '')) errors.acquiredOn = 'ledger.asset.error.date';
  if (v.inUseFrom && v.inUseFrom < v.acquiredOn) errors.inUseFrom = 'ledger.asset.error.inUse';
  if (v.disposedOn && v.disposedOn < (v.inUseFrom || v.acquiredOn)) errors.disposedOn = 'ledger.asset.error.disposed';
  if (!v.cost || Number(v.cost) <= 0) errors.cost = 'ledger.asset.error.cost';
  if (!errors.acquiredOn && !errors.cost) {
    try { depreciationPlan(assetRecord(v)); } catch (e) {
      if (!(e instanceof CoreError)) throw e;
      errors[e.code === 'LEDGER_ACCELERATED_NOT_ALLOWED' ? 'method' : 'acquiredOn'] = `errors.${e.code}`;
    }
  }
  return errors;
}

/** The record fields of the form values, with the plan. */
export function assetRecord(v, previous = null) {
  const record = {
    name: String(v.name || '').trim(), inventoryNumber: v.inventoryNumber || null, kind: v.kind, acquiredOn: v.acquiredOn,
    inUseFrom: v.inUseFrom || null, cost: v.cost, depreciationGroup: Number(v.depreciationGroup), method: v.method,
    disposedOn: v.disposedOn || null, accountingLifeMonths: v.accountingLifeMonths ? Number(v.accountingLifeMonths) : null,
    plan: previous?.plan || []
  };
  return record;
}

function planTable(record) {
  let tax;
  let books;
  try {
    tax = depreciationPlan(record);
    books = tax.lowValue ? [] : accountingPlan(record);
  } catch (e) {
    return h('p', { class: 'muted' }, t(e.code ? `errors.${e.code}` : 'errors.UNKNOWN'));
  }
  if (tax.lowValue) return h('p', { class: 'callout' }, t('ledger.asset.lowValue'));
  const byYear = new Map(books.map(b => [b.year, b]));
  return h('table', { class: 'table ledger-simple-table' },
    h('thead', {}, h('tr', {}, h('th', {}, t('ledger.year')), h('th', { class: 'num' }, t('ledger.asset.taxAmount')), h('th', { class: 'num' }, t('ledger.asset.taxResidual')), h('th', { class: 'num' }, t('ledger.asset.bookAmount')))),
    h('tbody', {}, tax.plan.map(p => h('tr', {}, h('td', {}, String(p.year)), h('td', { class: 'num' }, money(p.amount)), h('td', { class: 'num' }, money(p.residual)), h('td', { class: 'num' }, money(byYear.get(p.year)?.amount || ''))))),
    tax.disposal ? h('tfoot', {}, h('tr', {}, h('td', { colspan: '4' }, t('ledger.asset.disposalResidual', { amount: money(tax.disposal.residual) })))) : null);
}

export function openAssetForm(asset = null) {
  if (!canWrite()) return;
  const name = textField({ label: t('ledger.asset.name'), value: asset?.name || '', required: true });
  const number = textField({ label: t('ledger.asset.inventoryNumber'), value: asset?.inventoryNumber || '' });
  const kind = selectField({ label: t('ledger.asset.kind'), options: ['TANGIBLE', 'INTANGIBLE'].map(v => ({ value: v, label: t(`ledger.asset.kind.${v}`) })), value: asset?.kind || 'TANGIBLE' });
  const acquiredOn = dateField({ label: t('ledger.asset.acquiredOn'), value: asset?.acquiredOn || todayLocal(), required: true });
  const inUseFrom = dateField({ label: t('ledger.asset.inUseFrom'), value: asset?.inUseFrom || '' });
  const cost = amountField({ label: t('ledger.asset.cost'), value: asset?.cost || null, required: true, hint: t('ledger.asset.costHint') });
  const group = selectField({ label: t('ledger.asset.group'), options: GROUPS.map(g => ({ value: String(g), label: t('ledger.asset.groupOption', { g }) })), value: String(asset?.depreciationGroup ?? 1) });
  const method = selectField({ label: t('ledger.asset.method'), options: ['STRAIGHT', 'ACCELERATED'].map(v => ({ value: v, label: t(`ledger.asset.method.${v}`) })), value: asset?.method || 'STRAIGHT' });
  const disposedOn = dateField({ label: t('ledger.asset.disposedOn'), value: asset?.disposedOn || '' });
  const life = numberField({ label: t('ledger.asset.lifeMonths'), value: asset?.accountingLifeMonths ?? null, hint: t('ledger.asset.lifeHint') });
  const preview = h('div', { class: 'ledger-plan', 'aria-live': 'polite' });
  const fields = { name, acquiredOn, inUseFrom, cost, method, disposedOn };
  const values = () => ({
    name: name.value(), inventoryNumber: number.value(), kind: kind.value(), acquiredOn: acquiredOn.value(), inUseFrom: inUseFrom.value(),
    cost: cost.value(), depreciationGroup: group.value(), method: method.value(), disposedOn: disposedOn.value(), accountingLifeMonths: life.value()
  });
  const refresh = () => {
    clear(preview);
    const v = values();
    if (Object.keys(assetErrors(v)).length) return;
    preview.append(h('h4', {}, t('ledger.asset.plan')), planTable(assetRecord(v, asset)));
  };
  [kind, acquiredOn, inUseFrom, cost, group, method, disposedOn, life].forEach(f => f.input.addEventListener('change', refresh));

  async function save(modal) {
    const v = values();
    const errors = assetErrors(v);
    Object.entries(fields).forEach(([key, f]) => f.setError(errors[key] ? t(errors[key]) : null));
    if (Object.keys(errors).length) return;
    const record = assetRecord(v, asset);
    record.plan = depreciationPlan(record).plan;
    try {
      if (asset) await getStore().update('assets', asset.id, record);
      else await getStore().insert('assets', record);
      showToast(t('ledger.asset.saved'), { type: 'success' });
      modal.close();
    } catch (e) {
      showError(e, 'ledger.asset.error.save');
    }
  }

  async function remove(modal) {
    if (!(await confirmDialog(t('ledger.asset.confirmDelete'), { danger: true, okLabel: t('common.delete') }))) return;
    try { await getStore().remove('assets', asset.id); modal.close(); } catch (e) { showError(e, 'ledger.asset.error.save'); }
  }

  const actions = [{ label: t('common.cancel'), onClick: (m) => m.close() }, { label: t('common.save'), kind: 'primary', onClick: save }];
  if (asset) actions.unshift({ label: t('common.delete'), onClick: remove });
  openModal({
    title: asset ? t('ledger.asset.editTitle') : t('ledger.asset.newTitle'), wide: true,
    body: h('div', {}, h('div', { class: 'form-grid ledger-form' }, name.el, number.el, kind.el, acquiredOn.el, inUseFrom.el, cost.el, group.el, method.el, disposedOn.el, life.el), preview),
    actions
  });
  refresh();
}
