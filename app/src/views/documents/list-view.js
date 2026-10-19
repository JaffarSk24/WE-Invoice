// A sales list screen (invoices, proformas, credit notes, quotes, orders,
// delivery notes): the New button, search, filters (period, status,
// client, label, currency, payment), the table with totals and bulk
// actions, cards on a phone. Redrawn on every data change.
import { allowedStatuses } from '@we-invoice/core';
import '../../style/documents.css';
import { h, icon, selectEl, append } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { on } from '../../events.js';
import { navigate } from '../../router.js';
import { createTable } from '../../components/table.js';
import { createFilterBar, EMPTY_FILTER } from '../../components/filter-bar.js';
import { emptyState } from '../../components/empty-state.js';
import { todayLocal } from '../../components/dates.js';
import { isDemo } from '../shell/demo-mode.js';
import { LIST_ROUTES, salesHash } from './kinds.js';
import { documentRows, filterRows, byNewest, PAYMENT_FILTERS } from './rows.js';
import { listColumns } from './list-columns.js';
import { bulkActions } from './bulk.js';
import { allDocuments, contactsById, companyNow } from './source.js';

let unsubscribe = [];

export function goToNew(route, kind, params = {}) {
  window.location.hash = salesHash(route, { mode: 'new', params: { kind, ...params } });
}

function newButtons(route, config) {
  return config.newKinds.map((kind, i) => h('button', {
    type: 'button', class: `btn ${i === 0 ? (route === 'invoices' ? 'btn-brand' : 'btn-primary') : ''}`.trim(), dataset: { newKind: kind },
    onclick: () => goToNew(route, kind)
  }, icon('plus'), t(`documents.new.${kind}`)));
}

function statusesOf(kinds) {
  const all = new Set();
  kinds.forEach(k => allowedStatuses(k).forEach(s => all.add(s)));
  return [...all];
}

function emptyFor(route, config) {
  if (!companyNow()) {
    return emptyState({ title: t('documents.empty.noCompany.title'), text: t('documents.empty.noCompany.text'), iconName: 'building-2', actionLabel: t('documents.empty.noCompany.action'), onAction: () => navigate('onboarding') });
  }
  const kind = config.newKinds[0];
  const key = route.replace(/-(\w)/g, (m, c) => c.toUpperCase());
  return emptyState({
    title: t(`documents.empty.${key}.title`), text: t(`documents.empty.${key}.text`), iconName: config.icon,
    actionLabel: t(`documents.new.${kind}`), onAction: () => goToNew(route, kind), brand: route === 'invoices'
  });
}

export function renderDocumentList(root, route) {
  unsubscribe.forEach(off => off());
  unsubscribe = [];
  const config = LIST_ROUTES[route];
  let filter = { ...EMPTY_FILTER, preset: 'all', payment: '', query: '' };

  const rowsNow = () => {
    const today = todayLocal();
    const docs = allDocuments().filter(d => config.kinds.includes(d.kind));
    return documentRows(docs, { contacts: contactsById(), company: companyNow(), today }).sort(byNewest);
  };
  let all = rowsNow();
  const currencies = () => [...new Set(['EUR', ...all.map(r => r.currency)])];

  const table = createTable({
    key: `documents-${route}`, columns: listColumns(config), rows: [], selectable: true, bulkActions: bulkActions(),
    onRowClick: (row) => { window.location.hash = salesHash(route, { id: row.id }); },
    empty: h('p', { class: 'muted' }, t('documents.list.noMatch'))
  });
  const emptyBox = h('div', { class: 'documents-empty' });
  const listBox = h('div', { class: 'documents-list' });

  const apply = () => {
    const shown = filterRows(all, filter);
    const nothing = all.length === 0;
    emptyBox.hidden = !nothing;
    listBox.hidden = nothing;
    if (nothing) {
      while (emptyBox.firstChild) emptyBox.removeChild(emptyBox.firstChild);
      emptyBox.append(emptyFor(route, config));
      refreshIcons(emptyBox);
    }
    table.setRows(shown);
  };

  const search = h('input', { type: 'search', class: 'documents-search', placeholder: t('documents.list.search'), 'aria-label': t('documents.list.search') });
  let timer = null;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { filter = { ...filter, query: search.value }; apply(); }, 150); });

  const bar = createFilterBar({
    key: `documents-${route}`, statuses: statusesOf(config.kinds), currencies: currencies(), value: filter,
    onChange: (next) => { filter = { ...next, payment: filter.payment, query: filter.query }; apply(); }
  });
  const payable = config.kinds.some(k => !['QUOTE', 'ORDER_IN', 'ORDER_OUT', 'DELIVERY_NOTE'].includes(k));
  const payment = payable
    ? selectEl([{ value: '', label: t('documents.filter.anyPayment') }, ...PAYMENT_FILTERS.map(p => ({ value: p, label: t(`documents.filter.payment.${p}`) }))], '', { 'aria-label': t('documents.filter.payment'), class: 'documents-payment' })
    : null;
  if (payment) payment.addEventListener('change', () => { filter = { ...filter, payment: payment.value }; apply(); });
  filter = { ...bar.value(), payment: '', query: '' };

  listBox.append(h('div', { class: 'documents-tools' }, search, payment), bar.el, table.el);
  append(root, [
    h('header', { class: 'view-header' },
      h('h1', {}, t(config.title)),
      h('div', { class: 'view-actions' }, isDemo() ? h('span', { class: 'badge badge-demo' }, t('dashboard.demoBadge')) : null, newButtons(route, config))),
    emptyBox, listBox]);
  apply();
  refreshIcons(root);

  const redraw = () => { if (!root.isConnected) return; all = rowsNow(); apply(); };
  unsubscribe.push(on('data:changed', (e) => { if (!e || ['documents', 'contacts', 'company'].includes(e.collection)) redraw(); }));
  ['company:switched', 'demo:enabled', 'demo:disabled', 'peppol:status'].forEach(ev => unsubscribe.push(on(ev, redraw)));
}
