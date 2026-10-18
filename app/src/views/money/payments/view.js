// The Payments screen (route "payments"): every payment of every document
// with filters by period, direction, method and source and a search. A
// payment opens its actions: the eKasa helper for cash, card and on-site
// QR payments, and removal of a payment recorded by hand.
import { h, icon, clear } from '../../../ui/dom.js';
import { refreshIcons } from '../../../ui/icons.js';
import { t } from '../../../i18n/index.js';
import { createTable } from '../../../components/table.js';
import { emptyState } from '../../../components/empty-state.js';
import { PERIOD_PRESETS, periodRange } from '../../../components/dates.js';
import { listPayments, schema } from '@we-invoice/core';
import { moneyState } from '../shared/data.js';
import { keepFresh } from '../shared/live.js';
import { day, money } from '../shared/format.js';
import { openRecordDialog } from './record-dialog.js';
import { openPaymentActions } from './actions-dialog.js';
import { openOffsetDialog } from './offset-dialog.js';

const filter = { preset: 'thisYear', direction: '', method: '', source: '', query: '' };

function columns() {
  return [
    { id: 'date', label: t('payments.col.date'), render: r => day(r.date), sortValue: r => r.date, always: true },
    { id: 'document', label: t('payments.col.document'), render: r => r.docNumber || '', sortValue: r => r.docNumber || '' },
    { id: 'party', label: t('payments.col.party'), render: r => r.party, sortValue: r => r.party },
    { id: 'direction', label: t('payments.col.direction'), render: r => t(`payments.direction.${r.direction}`) },
    { id: 'method', label: t('payments.col.method'), render: r => t(`payments.method.${r.method}`) },
    { id: 'source', label: t('payments.col.source'), render: r => t(`payments.source.${r.source}`), hidden: true },
    {
      id: 'amount', label: t('payments.col.amount'), align: 'num', primary: true, sortValue: r => Number(r.amount),
      render: r => h('span', { class: r.direction === 'OUT' ? 'money-out' : 'money-in' }, `${r.direction === 'OUT' ? '-' : '+'}${money(r.amount, r.currency)}`)
    }
  ];
}

export function filteredPayments(state) {
  const range = filter.preset === 'all' ? { from: null, to: null } : periodRange(filter.preset);
  return listPayments(state.documents, { ...range, direction: filter.direction, method: filter.method, source: filter.source, query: filter.query });
}

function select(label, value, options, onChange) {
  return h('select', { 'aria-label': label, onchange: (e) => onChange(e.target.value) }, options.map(o => h('option', { value: o.value, selected: o.value === value }, o.label)));
}

function toolbar(redraw) {
  const set = (key) => (value) => { filter[key] = value; redraw(); };
  let timer = null;
  const search = h('input', {
    type: 'search', value: filter.query, placeholder: t('payments.search'), 'aria-label': t('payments.search'),
    oninput: (e) => { clearTimeout(timer); timer = setTimeout(() => { filter.query = e.target.value; redraw(); }, 200); }
  });
  return h('div', { class: 'money-toolbar', role: 'search' },
    select(t('filter.period'), filter.preset, PERIOD_PRESETS.map(p => ({ value: p, label: t(`filter.period.${p}`) })), set('preset')),
    select(t('payments.col.direction'), filter.direction, ['', 'IN', 'OUT'].map(v => ({ value: v, label: t(`payments.direction.${v || 'any'}`) })), set('direction')),
    select(t('payments.col.method'), filter.method, ['', ...schema.PAYMENT_METHODS].map(v => ({ value: v, label: t(`payments.method.${v || 'any'}`) })), set('method')),
    select(t('payments.col.source'), filter.source, ['', ...schema.PAYMENT_SOURCES].map(v => ({ value: v, label: t(`payments.source.${v || 'any'}`) })), set('source')),
    search);
}

export function renderPayments(root, ctx) {
  const draw = () => {
    const focusSearch = document.activeElement && document.activeElement.type === 'search' && root.contains(document.activeElement);
    clear(root);
    const state = moneyState();
    if (!state.ready) {
      root.append(h('header', { class: 'view-header' }, h('h1', {}, t('nav.payments'))),
        emptyState({ title: t('bank.noCompany.title'), text: t('bank.noCompany.text'), iconName: 'banknote' }));
      return;
    }
    root.append(h('header', { class: 'view-header' },
      h('h1', {}, t('nav.payments')),
      h('div', { class: 'view-actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => openOffsetDialog() }, icon('repeat'), t('payments.offset')),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => openRecordDialog(ctx) }, icon('plus'), t('payments.record')))),
    toolbar(draw));
    const table = createTable({
      key: 'payments', columns: columns(), rows: filteredPayments(state),
      onRowClick: (row) => openPaymentActions(ctx, row.docId, row.payment.id),
      empty: emptyState({ title: t('payments.empty.title'), text: t('payments.empty.text'), iconName: 'banknote' })
    });
    root.append(table.el);
    refreshIcons(root);
    if (focusSearch) {
      const input = root.querySelector('input[type="search"]');
      if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
    }
  };
  draw();
  keepFresh(root, draw);
}
