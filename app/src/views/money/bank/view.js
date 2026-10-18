// The Bank screen (route "bank"): the movements of the company's accounts
// with their matching state, the statement import, matching of the
// unmatched movements and the SEPA order for received invoices. A phone
// gets the same list as cards (components/table).
import { h, icon, clear } from '../../../ui/dom.js';
import { refreshIcons } from '../../../ui/icons.js';
import { t } from '../../../i18n/index.js';
import { createTable } from '../../../components/table.js';
import { emptyState } from '../../../components/empty-state.js';
import { navigate } from '../../../router.js';
import { moneyState } from '../shared/data.js';
import { keepFresh } from '../shared/live.js';
import { day, amountCell } from '../shared/format.js';
import { openImportDialog } from './import-dialog.js';
import { openMatchDialog } from './match-dialog.js';
import { openTxDialog } from './tx-dialog.js';
import { openPainDialog } from './pain-dialog.js';

const view = { accountId: '', unmatchedOnly: false };

function columns() {
  return [
    { id: 'date', label: t('bank.col.date'), render: r => day(r.date), sortValue: r => r.date, always: true },
    {
      id: 'counterparty', label: t('bank.col.counterparty'), sortValue: r => r.counterpartyName || '',
      render: r => h('span', { class: 'bank-party' }, r.counterpartyName || '', r.counterpartyIban ? h('small', { class: 'muted' }, r.counterpartyIban) : null)
    },
    { id: 'vs', label: t('bank.col.vs'), render: r => r.vs || '' },
    { id: 'message', label: t('bank.col.message'), render: r => r.message || '' },
    { id: 'amount', label: t('bank.col.amount'), align: 'num', primary: true, render: r => amountCell(r.amount, r.currency), sortValue: r => Number(r.amount) },
    {
      id: 'match', label: t('bank.col.match'),
      render: r => (r.matched?.confirmed
        ? h('span', { class: 'match-state is-matched' }, icon('circle-check'), h('span', {}, t('bank.match.state.confirmed')))
        : h('span', { class: 'match-state' }, icon('circle'), h('span', {}, t('bank.match.state.none'))))
    }
  ];
}

export function visibleTransactions(state, { accountId = '', unmatchedOnly = false } = {}) {
  return state.bankTransactions
    .filter(tx => (!accountId || tx.accountId === accountId) && (!unmatchedOnly || !tx.matched?.confirmed))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function toolbar(ctx, state, redraw) {
  const accounts = state.company?.bankAccounts || [];
  const select = h('select', { 'aria-label': t('bank.account'), class: 'bank-account-select', onchange: (e) => { view.accountId = e.target.value; redraw(); } },
    h('option', { value: '' }, t('bank.allAccounts')),
    accounts.map(a => h('option', { value: a.id, selected: a.id === view.accountId }, [a.name, a.iban].filter(Boolean).join(' '))));
  const unmatched = h('label', { class: 'checkbox-label' },
    h('input', { type: 'checkbox', checked: view.unmatchedOnly, onchange: (e) => { view.unmatchedOnly = e.target.checked; redraw(); } }),
    h('span', {}, t('bank.filter.unmatched')));
  return h('div', { class: 'money-toolbar' }, accounts.length > 1 ? select : null, unmatched);
}

function header(ctx, state) {
  const unmatched = state.bankTransactions.filter(tx => !tx.matched?.confirmed);
  return h('header', { class: 'view-header' },
    h('h1', {}, t('nav.bank')),
    h('div', { class: 'view-actions' },
      h('button', { type: 'button', class: 'btn', onclick: () => openPainDialog(ctx) }, icon('send'), t('bank.pay')),
      h('button', { type: 'button', class: 'btn', disabled: !unmatched.length, onclick: () => openMatchDialog(ctx, unmatched.map(tx => tx.id)) }, icon('circle-check'), t('bank.matchAll')),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: () => openImportDialog(ctx, { accountId: view.accountId }) }, icon('import'), t('bank.import'))));
}

export function renderBank(root, ctx) {
  const draw = () => {
    clear(root);
    const state = moneyState();
    if (!state.ready) {
      root.append(h('header', { class: 'view-header' }, h('h1', {}, t('nav.bank'))),
        emptyState({ title: t('bank.noCompany.title'), text: t('bank.noCompany.text'), iconName: 'landmark' }));
      return;
    }
    root.append(header(ctx, state));
    if (!(state.company.bankAccounts || []).length) {
      root.append(h('p', { class: 'callout callout-warning' }, t('bank.noAccounts'), ' ',
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => navigate('settings') }, t('bank.openSettings'))));
    }
    root.append(toolbar(ctx, state, draw));
    const rows = visibleTransactions(state, view);
    const empty = emptyState({
      title: t('bank.empty.title'), text: t('bank.empty.text'), iconName: 'landmark',
      actionLabel: t('bank.import'), actionIcon: 'import', onAction: () => openImportDialog(ctx, { accountId: view.accountId })
    });
    const table = createTable({ key: 'bank-tx', columns: columns(), rows, onRowClick: (tx) => openTxDialog(ctx, tx.id), empty });
    root.append(table.el);
    refreshIcons(root);
  };
  draw();
  keepFresh(root, draw);
}
