// The peňažný denník tab: figures of the year, warnings, the list of
// movements (cards on a phone) and the totals of every journal column.
// The wide table with all columns, as the MF SR form has it, is what the
// CSV and the print get (journalTables).
import { JOURNAL_COLUMNS, sum, sub, round, isZero } from '@we-invoice/core';
import { h } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { createTable } from '../../components/table.js';
import { emptyState } from '../../components/empty-state.js';
import { formatDate } from '../../components/dates.js';
import { money, stats, callout } from './kit.js';
import { tableSpec } from './export.js';
import { openEntryForm } from './entry-form.js';

const signed = (cols, medium) => round(sub(cols[`${medium}In`] || '0', cols[`${medium}Out`] || '0'), 2);
const net = (row) => row.cols[row.category] || (row.category === 'TRANSFER' ? row.cols.transferIn : '0') || '0';
const total = (rows, fn) => money(round(sum(rows.map(fn)), 2));

function columns(payer) {
  return [
    { id: 'date', label: t('ledger.col.date'), render: r => formatDate(r.date), sortValue: r => r.date, primary: true, always: true },
    { id: 'number', label: t('ledger.col.number'), render: r => r.number || '', sortValue: r => r.number || '' },
    { id: 'text', label: t('ledger.col.text'), render: r => r.text || (r.virtual ? t('ledger.journal.nonCash') : '') },
    { id: 'category', label: t('ledger.col.category'), render: r => t(`ledger.category.${r.category}`), sortValue: r => r.category },
    { id: 'cash', label: t('ledger.column.cash'), align: 'num', render: r => (isZero(signed(r.cols, 'cash')) ? '' : money(signed(r.cols, 'cash'))), total: rows => total(rows, r => signed(r.cols, 'cash')) },
    { id: 'bank', label: t('ledger.column.bank'), align: 'num', render: r => (isZero(signed(r.cols, 'bank')) ? '' : money(signed(r.cols, 'bank'))), total: rows => total(rows, r => signed(r.cols, 'bank')) },
    { id: 'amount', label: t('ledger.col.amount'), align: 'num', render: r => money(net(r)), sortValue: r => Number(net(r)) },
    { id: 'vat', label: t('ledger.col.vat'), align: 'num', hidden: !payer, render: r => money(r.cols.vatIn || r.cols.vatOut || '') }
  ];
}

function warnings(journal, extra) {
  const all = [...journal.warnings, ...extra];
  const count = (code) => all.filter(w => w.code === code).length;
  return ['EXPENSE_UNCATEGORIZED', 'PAYMENT_WITHOUT_DOCUMENT', 'CASH_NEGATIVE', 'PAYMENT_OFFSET', 'LEDGER_FX_RATE_MISSING']
    .filter(code => count(code))
    .map(code => callout(code === 'CASH_NEGATIVE' ? 'danger' : 'warning', t(`ledger.warning.${code}`, { n: count(code) })));
}

function columnTotals(journal) {
  const rows = JOURNAL_COLUMNS.filter(c => !isZero(journal.totals[c]));
  if (!rows.length) return null;
  return h('section', { class: 'card ledger-card ledger-column-totals' },
    h('h2', {}, t('ledger.journal.columnTotals')),
    h('dl', { class: 'ledger-dl' }, rows.flatMap(c => [h('dt', {}, t(`ledger.column.${c}`)), h('dd', { class: 'num' }, money(journal.totals[c]))])));
}

/** The tab content. ctx: { journal, summary, payer, warnings, readOnly } */
export function renderJournalTab(panel, ctx) {
  const { journal, summary } = ctx;
  panel.append(stats([
    { label: t('ledger.stat.taxIncome'), value: money(summary.taxIncome) },
    { label: t('ledger.stat.taxExpense'), value: money(summary.taxExpense) },
    { label: t('ledger.stat.result'), value: money(summary.result), tone: summary.result.startsWith('-') ? 'danger' : null },
    { label: t('ledger.stat.cash'), value: money(journal.closing.cash) },
    { label: t('ledger.stat.bank'), value: money(journal.closing.bank) }
  ]), ...warnings(journal, ctx.warnings || []));
  const empty = emptyState({
    title: t('ledger.journal.empty.title'), text: t('ledger.journal.empty.text'), iconName: 'notebook-pen',
    actionLabel: ctx.readOnly ? null : t('ledger.entry.add'), onAction: () => openEntryForm()
  });
  const table = createTable({
    key: 'ledger-journal', columns: columns(ctx.payer), rows: journal.rows, rowKey: r => r.id || `${r.date}-${r.category}`,
    onRowClick: (row) => { if (!row.virtual) openEntryForm(ctx.entryById(row.id)); }, empty
  });
  panel.append(table.el, columnTotals(journal));
}

/**
 * The wide peňažný denník and the opening and closing state for CSV and
 * print. The print leaves out money columns that stay empty all year, so
 * the page stays readable; the CSV keeps every column of the form.
 */
export function journalTables(journal, { print = false } = {}) {
  const used = JOURNAL_COLUMNS.filter(c => !print || !isZero(journal.totals[c]));
  const cols = [
    { label: t('ledger.col.date'), value: r => r.date, foot: () => t('ledger.journal.total') },
    { label: t('ledger.col.number'), value: r => r.number },
    { label: t('ledger.col.text'), value: r => r.text },
    ...used.map(c => ({ label: t(`ledger.column.${c}`), value: r => r.cols[c] || null, foot: totals => totals[c], num: true }))
  ];
  const state = [
    { label: t('ledger.col.item'), value: r => r.label },
    { label: t('ledger.column.cash'), value: r => r.cash, num: true },
    { label: t('ledger.column.bank'), value: r => r.bank, num: true }
  ];
  return [
    tableSpec(t('ledger.journal.title', { year: journal.year }), cols, journal.rows, journal.totals),
    tableSpec(t('ledger.journal.balances'), state, [
      { label: t('ledger.journal.opening'), ...journal.opening },
      { label: t('ledger.journal.closing'), ...journal.closing }
    ])
  ];
}
