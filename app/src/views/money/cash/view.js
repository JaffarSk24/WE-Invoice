// The Cash desk screen (route "cash"): the cash books, the pokladničná
// kniha of the chosen book for a period with the running balance,
// receipts and expenses, export to CSV and printing.
import { h, icon, clear, append } from '../../../ui/dom.js';
import { refreshIcons } from '../../../ui/icons.js';
import { t } from '../../../i18n/index.js';
import { createTable } from '../../../components/table.js';
import { emptyState } from '../../../components/empty-state.js';
import { PERIOD_PRESETS, periodRange } from '../../../components/dates.js';
import { cashBookRows, cashBalance } from '@we-invoice/core';
import { moneyState } from '../shared/data.js';
import { keepFresh } from '../shared/live.js';
import { day, money } from '../shared/format.js';
import { openBookDialog } from './book-dialog.js';
import { openVoucherDialog, openVoucherActions } from './voucher-dialog.js';
import { exportCashBook, printCashBook } from './export.js';

const view = { bookId: null, preset: 'thisMonth' };

function columns(currency) {
  const num = (field) => r => (r[field] === null ? '' : money(r[field], currency));
  return [
    { id: 'date', label: t('cash.col.date'), render: r => day(r.date), sortValue: r => r.date, always: true },
    { id: 'number', label: t('cash.col.number'), render: r => r.number || '' },
    { id: 'kind', label: t('cash.col.kind'), render: r => t(`cash.kindShort.${r.kind}`) },
    { id: 'partner', label: t('cash.col.partner'), render: r => r.partner },
    { id: 'purpose', label: t('cash.col.purpose'), render: r => r.purpose },
    { id: 'income', label: t('cash.col.income'), align: 'num', render: num('income') },
    { id: 'expense', label: t('cash.col.expense'), align: 'num', render: num('expense') },
    { id: 'balance', label: t('cash.col.balance'), align: 'num', primary: true, render: num('balance') }
  ];
}

export function currentBook(state) {
  return state.cashBooks.find(b => b.id === view.bookId) || state.cashBooks[0] || null;
}

export function currentPeriod() {
  return view.preset === 'all' ? { from: null, to: null } : periodRange(view.preset);
}

function controls(state, book, redraw) {
  const books = h('select', { 'aria-label': t('cash.book'), onchange: (e) => { view.bookId = e.target.value; redraw(); } },
    state.cashBooks.map(b => h('option', { value: b.id, selected: b.id === book.id }, `${b.name} (${b.currency})`)));
  const period = h('select', { 'aria-label': t('cash.period'), onchange: (e) => { view.preset = e.target.value; redraw(); } },
    PERIOD_PRESETS.map(p => h('option', { value: p, selected: p === view.preset }, t(`filter.period.${p}`))));
  return h('div', { class: 'money-toolbar' }, state.cashBooks.length > 1 ? books : null, period,
    h('strong', { class: 'cash-balance' }, t('cash.balance', { amount: money(cashBalance(book, state.documents), book.currency) })));
}

function header(ctx, state, book) {
  const act = (label, iconName, onclick, primary = false) => h('button', { type: 'button', class: `btn ${primary ? 'btn-primary' : ''}`.trim(), onclick }, icon(iconName), label);
  return h('header', { class: 'view-header' },
    h('h1', {}, t('nav.cash')),
    h('div', { class: 'view-actions' },
      act(t('cash.newBook'), 'plus', () => openBookDialog()),
      book ? act(t('cash.csv'), 'file-spreadsheet', () => exportCashBook(ctx, book, currentPeriod())) : null,
      book ? act(t('cash.print'), 'file-text', () => printCashBook(book, currentPeriod())) : null,
      book ? act(t('cash.newOut'), 'circle-x', () => openVoucherDialog({ book, kind: 'CASH_OUT' })) : null,
      book ? act(t('cash.newIn'), 'circle-plus', () => openVoucherDialog({ book, kind: 'CASH_IN' }), true) : null));
}

export function renderCash(root, ctx) {
  const draw = () => {
    clear(root);
    const state = moneyState();
    if (!state.ready) {
      root.append(h('header', { class: 'view-header' }, h('h1', {}, t('nav.cash'))),
        emptyState({ title: t('bank.noCompany.title'), text: t('bank.noCompany.text'), iconName: 'wallet' }));
      return;
    }
    const book = currentBook(state);
    append(root, [header(ctx, state, book)]);
    if (!book) {
      root.append(emptyState({ title: t('cash.empty.title'), text: t('cash.empty.text'), iconName: 'wallet', actionLabel: t('cash.newBook'), onAction: () => openBookDialog() }));
      refreshIcons(root);
      return;
    }
    const period = currentPeriod();
    const data = cashBookRows(book, state.documents, period);
    append(root, [controls(state, book, draw),
      h('p', { class: 'muted cash-summary' }, [
        `${t('cash.opening')}: ${money(data.opening, book.currency)}`, `${t('cash.col.income')}: ${money(data.income, book.currency)}`,
        `${t('cash.col.expense')}: ${money(data.expense, book.currency)}`, `${t('cash.closingBalance')}: ${money(data.closing, book.currency)}`
      ].join(' / '))]);
    const table = createTable({
      key: 'cash-book', columns: columns(book.currency), rows: data.rows,
      onRowClick: (row) => openVoucherActions(row.id),
      empty: emptyState({ title: t('cash.noVouchers'), iconName: 'wallet' })
    });
    root.append(table.el);
    refreshIcons(root);
  };
  draw();
  keepFresh(root, draw);
}
