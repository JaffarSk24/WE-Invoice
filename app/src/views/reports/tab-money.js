// The receivables and payables tab (aging by 1-15, 16-30, 31-60 and 60+
// days past due on today's local date) and the cash flow forecast tab
// (open invoices, recurring invoices and received invoices by month).
import { h, append } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { navigate } from '../../router.js';
import { agingReport, cashflowForecast, AGING_BUCKETS, sum, decimalComma } from '@we-invoice/core';
import { todayLocal, formatDate } from '../../components/dates.js';
import { barChart } from './chart.js';
import { reportTable } from './table.js';
import { eur, compact, periodLabel, summaryCards } from './format.js';
import { documentRoute } from '../search/engine.js';

const money = (field) => ({ align: 'num', value: (r) => decimalComma(r[field]), render: (r) => eur(r[field]), total: (rows) => eur(sum(rows.map(r => r[field] || '0'))) });

function agingSide(panel, side, name) {
  const prefix = `reports.aging.${name}`;
  append(panel, [
    h('h3', { class: 'report-section-title' }, t(`${prefix}.title`)),
    summaryCards([
      { label: t('reports.aging.total'), value: eur(side.total) },
      { label: t('reports.aging.overdue'), value: eur(side.overdue), tone: side.overdue !== '0.00' ? 'warn' : null },
      ...AGING_BUCKETS.map(b => ({ label: t(`reports.aging.bucket.${b}`), value: eur(side.buckets[b]), note: t('reports.aging.count', { count: side.counts[b] }) }))
    ]),
    reportTable({
      title: t(`${prefix}.byContact`), fileName: `${t(`${prefix}.file`)}-${todayLocal()}`, rows: side.byContact, empty: t(`${prefix}.empty`),
      onRowClick: (row) => { if (row.id) navigate(`contacts/${row.id}`); },
      columns: [
        { id: 'name', label: t('reports.col.contact'), value: (r) => r.name || t('reports.unknownContact') },
        { id: 'count', label: t('reports.col.count'), align: 'num', value: (r) => r.count },
        ...AGING_BUCKETS.map(b => ({ id: b, label: t(`reports.aging.bucket.${b}`), ...money(b) })),
        { id: 'total', label: t('reports.aging.total'), ...money('total') }
      ]
    }),
    reportTable({
      title: t(`${prefix}.documents`), fileName: `${t(`${prefix}.file`)}-${t('reports.aging.docsFile')}-${todayLocal()}`, rows: side.documents, empty: t(`${prefix}.empty`),
      onRowClick: (row) => navigate(documentRoute(row.kind, row.id)),
      columns: [
        { id: 'number', label: t('reports.col.number'), value: (r) => r.number },
        { id: 'name', label: t('reports.col.contact'), value: (r) => r.name },
        { id: 'dueDate', label: t('reports.col.dueDate'), value: (r) => r.dueDate, render: (r) => formatDate(r.dueDate) },
        { id: 'days', label: t('reports.col.daysOverdue'), align: 'num', value: (r) => r.days },
        { id: 'due', label: t('reports.col.due'), ...money('due') }
      ]
    })]);
}

export function renderAgingPanel(panel, { data }) {
  const report = agingReport(data.documents, todayLocal());
  panel.append(h('p', { class: 'muted report-note' }, t('reports.aging.asOf', { date: formatDate(report.today) })));
  agingSide(panel, report.receivables, 'receivables');
  agingSide(panel, report.payables, 'payables');
}

export function renderCashflowPanel(panel, { data, months = 6 }) {
  const report = cashflowForecast({ documents: data.documents, recurringTemplates: data.recurringTemplates }, { today: todayLocal(), months });
  append(panel, [
    h('p', { class: 'muted report-note' }, t('reports.cashflow.note')),
    summaryCards([
      { label: t('reports.cashflow.inflow'), value: eur(report.inflow) },
      { label: t('reports.cashflow.outflow'), value: eur(report.outflow) },
      { label: t('reports.cashflow.net'), value: eur(report.net) },
      { label: t('reports.cashflow.overdueIn'), value: eur(report.overdueIn), tone: report.overdueIn !== '0.00' ? 'warn' : null }
    ]),
    barChart({
      title: t('reports.cashflow.chartTitle'),
      labels: report.buckets.map(b => periodLabel(b.key)),
      series: [
        { name: t('reports.cashflow.inflow'), values: report.buckets.map(b => b.inflow), cls: 'series-in' },
        { name: t('reports.cashflow.outflow'), values: report.buckets.map(b => `-${b.outflow}`), cls: 'series-out' },
        { name: t('reports.cashflow.balance'), values: report.buckets.map(b => b.balance), kind: 'line', cls: 'series-1' }
      ],
      format: compact
    }),
    reportTable({
      title: t('reports.cashflow.byMonth'), fileName: `${t('reports.cashflow.file')}-${report.today}`, rows: report.buckets,
      columns: [
        { id: 'key', label: t('reports.col.period'), value: (r) => r.key, render: (r) => periodLabel(r.key) },
        { id: 'inflow', label: t('reports.cashflow.inflow'), ...money('inflow') },
        { id: 'outflow', label: t('reports.cashflow.outflow'), ...money('outflow') },
        { id: 'net', label: t('reports.cashflow.net'), ...money('net') },
        { id: 'balance', label: t('reports.cashflow.balance'), align: 'num', value: (r) => decimalComma(r.balance), render: (r) => eur(r.balance) }
      ]
    }),
    reportTable({
      title: t('reports.cashflow.items'), fileName: `${t('reports.cashflow.file')}-${t('reports.cashflow.itemsFile')}-${report.today}`, rows: report.items,
      onRowClick: (row) => navigate(row.source === 'recurring' ? `recurring/${row.id}` : documentRoute(row.kind, row.id)),
      columns: [
        { id: 'date', label: t('reports.col.expected'), value: (r) => r.date, render: (r) => formatDate(r.date) },
        { id: 'source', label: t('reports.cashflow.source'), value: (r) => t(`reports.cashflow.source.${r.source}`) },
        { id: 'number', label: t('reports.col.number'), value: (r) => r.number },
        { id: 'name', label: t('reports.col.contact'), value: (r) => r.name },
        { id: 'amount', label: t('reports.col.amount'), ...money('amount') }
      ]
    })]);
}
