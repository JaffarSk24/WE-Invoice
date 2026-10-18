// Paying received invoices by a SEPA batch: the open received invoices in
// EUR with the supplier's IBAN, ticked by default, the account to pay
// from and the execution date. The pain.001 file is saved for upload to
// internet banking; nothing in the data changes until the payments arrive
// on a statement and are matched.
import { h } from '../../../ui/dom.js';
import { openModal } from '../../../ui/modal.js';
import { t } from '../../../i18n/index.js';
import { showToast, showError } from '../../../ui/toast.js';
import { dateField } from '../../../components/fields.js';
import { todayLocal } from '../../../components/dates.js';
import { paymentsForReceived, buildPain001, validatePain001, sum } from '@we-invoice/core';
import { moneyState } from '../shared/data.js';
import { money } from '../shared/format.js';

export function openPainDialog(ctx) {
  const state = moneyState();
  if (!state.ready) { showToast(t('bank.noCompany.title'), { type: 'info' }); return; }
  const { payments, skipped } = paymentsForReceived(state.documents, state.contacts);
  const docsById = new Map(state.documents.map(d => [d.id, d]));
  const accounts = (state.company.bankAccounts || []).filter(a => a.currency === 'EUR');
  const account = h('select', { 'aria-label': t('bank.pain.debtor') }, accounts.map(a => h('option', { value: a.id, selected: a.isDefault }, [a.name, a.iban].filter(Boolean).join(' '))));
  const date = dateField({ label: t('bank.pain.date'), value: todayLocal(), required: true });
  const total = h('p', { class: 'pain-total' });
  const checks = payments.map(p => h('input', { type: 'checkbox', checked: true, 'aria-label': docsById.get(p.docId)?.number || p.docId }));
  const chosen = () => payments.filter((p, i) => checks[i].checked);
  const refresh = () => { total.textContent = t('bank.pain.total', { amount: money(sum(chosen().map(p => p.amount)), 'EUR') }); };
  checks.forEach(c => c.addEventListener('change', refresh));
  refresh();
  const table = payments.length ? h('table', { class: 'table preview-table' },
    h('thead', {}, h('tr', {}, h('th', {}), [t('bank.pain.col.number'), t('bank.pain.col.supplier'), t('bank.pain.col.iban'), t('bank.pain.col.amount')].map((c, i) => h('th', { class: i === 3 ? 'num' : null }, c)))),
    h('tbody', {}, payments.map((p, i) => h('tr', {},
      h('td', {}, checks[i]), h('td', {}, docsById.get(p.docId)?.number || ''), h('td', {}, p.creditorName), h('td', {}, p.creditorIban), h('td', { class: 'num' }, money(p.amount, 'EUR'))))))
    : h('p', { class: 'muted' }, t('bank.pain.none'));
  const notes = skipped.map(s => h('p', { class: 'callout callout-warning' }, t(`bank.pain.skipped.${s.code}`, { number: docsById.get(s.docId)?.number || s.docId })));
  const download = async (m) => {
    const list = chosen().map(p => ({ ...p, executionDate: date.value() || todayLocal() }));
    const debtorAccount = accounts.find(a => a.id === account.value);
    const debtor = { name: state.company.name, iban: debtorAccount?.iban, bic: debtorAccount?.bic || null };
    const problems = validatePain001(list, debtor);
    if (problems.length) { showToast(t('bank.pain.problems', { n: problems.length }), { type: 'error' }); console.warn('pain.001 problems', problems); return; }
    try {
      const xml = buildPain001(list, debtor, { executionDate: date.value() || todayLocal() });
      await ctx.transport.files.saveAs(`pain001-${date.value() || todayLocal()}.xml`, new Blob([xml], { type: 'application/xml' }));
      showToast(t('bank.pain.done', { n: list.length }), { type: 'success' });
      m.close();
    } catch (e) {
      showError(e);
    }
  };
  openModal({
    title: t('bank.pain.title'), wide: true,
    body: h('div', {}, h('p', { class: 'field-hint' }, t('bank.pain.text')),
      accounts.length ? h('label', { class: 'field' }, h('span', {}, t('bank.pain.debtor')), account) : h('p', { class: 'callout callout-warning' }, t('bank.noAccounts')),
      date.el, table, notes, total),
    actions: [
      { label: t('common.cancel'), onClick: (m) => m.close() },
      { label: t('bank.pain.download', { n: payments.length }), kind: 'primary', onClick: download }
    ]
  });
}
