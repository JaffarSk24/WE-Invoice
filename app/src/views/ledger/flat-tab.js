// Daňová evidencia with flat-rate expenses: the income records in date
// order and the summary for DPFO typ B, table 1, with the flat expenses
// and the insurance paid. The disclaimer says what the summary is: help
// for filling in the return, not the return itself.
import { incomeRecords, flatSummary, sum, round } from '@we-invoice/core';
import { h } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { createTable } from '../../components/table.js';
import { emptyState } from '../../components/empty-state.js';
import { formatDate } from '../../components/dates.js';
import { money, stats, callout } from './kit.js';
import { tableSpec } from './export.js';
import { openEntryForm } from './entry-form.js';

function recordColumns() {
  return [
    { id: 'date', label: t('ledger.col.date'), render: r => formatDate(r.date), sortValue: r => r.date, primary: true, always: true },
    { id: 'number', label: t('ledger.col.number'), render: r => r.number || '' },
    { id: 'text', label: t('ledger.col.text'), render: r => r.text || '' },
    { id: 'paragraph', label: t('ledger.col.paragraph'), render: r => t(`ledger.paragraph.${r.paragraph}`) },
    { id: 'medium', label: t('ledger.col.medium'), render: r => t(`ledger.medium.${r.medium}`) },
    { id: 'amount', label: t('ledger.col.amount'), align: 'num', render: r => money(r.amount), total: rows => money(rows.length ? rows[rows.length - 1].running : '0') },
    { id: 'running', label: t('ledger.col.running'), align: 'num', render: r => money(r.running), hidden: true }
  ];
}

/** ctx: { entries, year, company, entryById, readOnly } */
export function renderIncomeTab(panel, ctx) {
  const records = incomeRecords(ctx.entries, ctx.year);
  const table = createTable({
    key: 'ledger-income', columns: recordColumns(), rows: records.rows,
    onRowClick: (row) => openEntryForm(ctx.entryById(row.id)),
    empty: emptyState({ title: t('ledger.income.empty.title'), text: t('ledger.income.empty.text'), iconName: 'notebook-pen', actionLabel: ctx.readOnly ? null : t('ledger.entry.add'), onAction: () => openEntryForm() })
  });
  panel.append(table.el);
}

function summaryOf(ctx) {
  return flatSummary({ entries: ctx.entries, year: ctx.year, startDate: ctx.company?.businessStartDate || null });
}

export function renderFlatSummaryTab(panel, ctx) {
  const s = summaryOf(ctx);
  panel.append(
    callout('info', t('ledger.flat.disclaimer')),
    stats([
      { label: t('ledger.flat.income'), value: money(s.income) },
      { label: t('ledger.flat.flatExpenses'), value: money(round(sum(s.groups.map(g => g.expenses)), 2)) },
      { label: t('ledger.flat.insurance'), value: money(s.insurance) },
      { label: t('ledger.flat.base'), value: money(s.base) }
    ]),
    s.groups.some(g => g.capped) ? callout('warning', t('ledger.flat.capped', { cap: money(s.groups.find(g => g.capped).cap) })) : null,
    h('section', { class: 'card' },
      h('h2', {}, t('ledger.flat.table1')),
      s.rows.length ? h('table', { class: 'table ledger-simple-table' },
        h('thead', {}, h('tr', {}, h('th', {}, t('ledger.col.paragraph')), h('th', { class: 'num' }, t('ledger.flat.col.income')), h('th', { class: 'num' }, t('ledger.flat.col.expenses')))),
        h('tbody', {}, s.rows.map(r => h('tr', {}, h('td', {}, t(`ledger.paragraph.${r.paragraph}`)), h('td', { class: 'num' }, money(r.income)), h('td', { class: 'num' }, money(r.expenses))))),
        h('tfoot', {}, h('tr', {}, h('td', {}, t('ledger.flat.insuranceRow')), h('td', {}), h('td', { class: 'num' }, money(s.insurance))),
          h('tr', {}, h('td', {}, t('ledger.journal.total')), h('td', { class: 'num' }, money(s.income)), h('td', { class: 'num' }, money(s.expenses)))))
        : h('p', { class: 'muted' }, t('ledger.flat.noIncome'))));
}

export function flatTables(ctx) {
  const records = incomeRecords(ctx.entries, ctx.year);
  const s = summaryOf(ctx);
  const recordCols = [
    { label: t('ledger.col.date'), value: r => r.date, foot: () => t('ledger.journal.total') },
    { label: t('ledger.col.number'), value: r => r.number },
    { label: t('ledger.col.text'), value: r => r.text },
    { label: t('ledger.col.paragraph'), value: r => t(`ledger.paragraph.${r.paragraph}`) },
    { label: t('ledger.col.medium'), value: r => t(`ledger.medium.${r.medium}`) },
    { label: t('ledger.col.amount'), value: r => r.amount, num: true, foot: rec => rec.total }
  ];
  const summaryCols = [
    { label: t('ledger.col.paragraph'), value: r => r.label },
    { label: t('ledger.flat.col.income'), value: r => r.income, num: true },
    { label: t('ledger.flat.col.expenses'), value: r => r.expenses, num: true }
  ];
  const summaryRows = [
    ...s.rows.map(r => ({ label: t(`ledger.paragraph.${r.paragraph}`), income: r.income, expenses: r.expenses })),
    { label: t('ledger.flat.insuranceRow'), income: null, expenses: s.insurance },
    { label: t('ledger.journal.total'), income: s.income, expenses: s.expenses },
    { label: t('ledger.flat.base'), income: s.base, expenses: null }
  ];
  return [tableSpec(t('ledger.income.title', { year: ctx.year }), recordCols, records.rows, records), tableSpec(t('ledger.flat.table1'), summaryCols, summaryRows)];
}
