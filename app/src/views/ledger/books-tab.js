// Kniha pohľadávok and kniha záväzkov at a day (31 December of the year,
// or today for the running year): documents still open, what was paid by
// then and how long they are overdue. A row opens nothing: the documents
// themselves belong to the sales and purchase screens.
import { receivablesBook, payablesBook } from '@we-invoice/core';
import { h, append } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { createTable } from '../../components/table.js';
import { emptyState } from '../../components/empty-state.js';
import { formatDate } from '../../components/dates.js';
import { formatAmount } from '../../components/decimal.js';
import { money } from './kit.js';
import { tableSpec } from './export.js';

/** The day the books are read at: year end, or today in the running year. */
export function bookDate(year, today) {
  const end = `${year}-12-31`;
  return today < end && today.startsWith(`${year}-`) ? today : end;
}

function columns() {
  return [
    { id: 'number', label: t('ledger.col.number'), render: r => r.number || '', primary: true, always: true, sortValue: r => r.number || '' },
    { id: 'party', label: t('ledger.col.party'), render: r => r.party || '', sortValue: r => r.party || '' },
    { id: 'issueDate', label: t('ledger.col.issueDate'), render: r => formatDate(r.issueDate), sortValue: r => r.issueDate || '' },
    { id: 'dueDate', label: t('ledger.col.dueDate'), render: r => formatDate(r.dueDate), sortValue: r => r.dueDate || '' },
    { id: 'total', label: t('ledger.col.total'), align: 'num', render: r => formatAmount(r.total, r.currency) },
    { id: 'outstanding', label: t('ledger.col.outstanding'), align: 'num', render: r => money(r.outstandingEur), sortValue: r => Number(r.outstandingEur) },
    { id: 'overdue', label: t('ledger.col.overdueDays'), align: 'num', render: r => (r.overdueDays ? String(r.overdueDays) : ''), sortValue: r => r.overdueDays }
  ];
}

function section(title, book, key) {
  const table = createTable({
    key, columns: columns(), rows: book.rows, rowKey: r => r.docId,
    empty: emptyState({ title: t('ledger.books.empty'), iconName: 'circle-check' })
  });
  return h('section', { class: 'ledger-book' },
    h('h2', {}, title, ' ', h('span', { class: 'muted num' }, money(book.total))),
    book.rows.some(r => r.fxMissing) ? h('p', { class: 'callout callout-warning' }, t('ledger.books.fxMissing')) : null,
    table.el);
}

export function booksAt(documents, date) {
  return { receivables: receivablesBook(documents, date), payables: payablesBook(documents, date) };
}

/** ctx: { documents, date, flat } (the tax records keep receivables only) */
export function renderBooksTab(panel, ctx) {
  const books = booksAt(ctx.documents, ctx.date);
  append(panel, [h('p', { class: 'muted' }, t('ledger.books.at', { date: formatDate(ctx.date) })),
    section(t('ledger.books.receivables'), books.receivables, 'ledger-receivables'),
    ctx.flat ? null : section(t('ledger.books.payables'), books.payables, 'ledger-payables')]);
}

export function booksTables(documents, date, flat = false) {
  const books = booksAt(documents, date);
  const cols = [
    { label: t('ledger.col.number'), value: r => r.number },
    { label: t('ledger.col.party'), value: r => r.party },
    { label: t('ledger.col.issueDate'), value: r => r.issueDate },
    { label: t('ledger.col.dueDate'), value: r => r.dueDate },
    { label: t('ledger.col.currency'), value: r => r.currency },
    { label: t('ledger.col.total'), value: r => r.total, num: true },
    { label: t('ledger.col.paid'), value: r => r.paid, num: true },
    { label: t('ledger.col.outstanding'), value: r => r.outstandingEur, num: true, foot: b => b.total }
  ];
  const out = [tableSpec(t('ledger.books.receivables'), cols, books.receivables.rows, books.receivables)];
  if (!flat) out.push(tableSpec(t('ledger.books.payables'), cols, books.payables.rows, books.payables));
  return out;
}
