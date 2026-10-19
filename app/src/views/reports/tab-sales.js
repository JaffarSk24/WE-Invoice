// The sales and purchases tabs: totals against last year, the chart by
// period (this year's bars next to last year's), and tables by period,
// client or supplier, item, label and project.
import { h, append } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { navigate } from '../../router.js';
import { salesReport, sum, decimalComma } from '@we-invoice/core';
import { barChart } from './chart.js';
import { reportTable } from './table.js';
import { eur, compact, changeText, periodLabel, summaryCards } from './format.js';

const money = (field) => ({ align: 'num', value: (r) => decimalComma(r[field]), render: (r) => eur(r[field]), total: (rows) => eur(sum(rows.map(r => r[field] || '0'))) });

export function runSales(data, period, direction) {
  return salesReport(data.documents, {
    from: period.from, to: period.to, granularity: period.granularity, direction,
    label: period.label || undefined, project: period.project || undefined
  });
}

function contactRoute(row) {
  return row.id ? `contacts/${row.id}` : null;
}

export function renderSalesPanel(panel, { data, period, direction }) {
  const report = runSales(data, period, direction);
  const prefix = `reports.${direction}`;
  const file = (part) => `${t(`${prefix}.file`)}-${part}-${period.from || ''}-${period.to || ''}`;
  append(panel, [
    summaryCards([
      { label: t(`${prefix}.totalNet`), value: eur(report.total.net), note: changeText(report.change) ? t('reports.vsLastYear', { change: changeText(report.change) }) : null },
      { label: t('reports.totalGross'), value: eur(report.total.gross) },
      { label: t('reports.documents'), value: String(report.total.count) },
      { label: t('reports.lastYearNet'), value: eur(report.previous.net) }
    ]),
    report.unconverted ? h('p', { class: 'muted report-note' }, t('reports.unconverted', { count: report.unconverted })) : null,
    report.byPeriod.length ? barChart({
      title: t(`${prefix}.chartTitle`),
      labels: report.byPeriod.map(p => periodLabel(p.key)),
      series: [
        { name: t('reports.series.current'), values: report.byPeriod.map(p => p.net), cls: 'series-1' },
        { name: t('reports.series.lastYear'), values: report.byPeriod.map(p => p.prevNet), cls: 'series-2' }
      ],
      format: compact
    }) : null,
    reportTable({
      title: t('reports.byPeriod'), fileName: file('period'), rows: report.byPeriod,
      columns: [
        { id: 'key', label: t('reports.col.period'), value: (r) => r.key, render: (r) => periodLabel(r.key) },
        { id: 'count', label: t('reports.col.count'), align: 'num', value: (r) => r.count, total: (rows) => String(rows.reduce((a, r) => a + r.count, 0)) },
        { id: 'net', label: t('reports.col.net'), ...money('net') },
        { id: 'gross', label: t('reports.col.gross'), ...money('gross') },
        { id: 'prevNet', label: t('reports.col.lastYear'), ...money('prevNet') },
        { id: 'change', label: t('reports.col.change'), align: 'num', value: (r) => (r.change === null ? '' : decimalComma(r.change)), render: (r) => changeText(r.change) }
      ]
    }),
    reportTable({
      title: t(`${prefix}.byContact`), fileName: file('contacts'), rows: report.byContact,
      onRowClick: (row) => { const route = contactRoute(row); if (route) navigate(route); },
      columns: [
        { id: 'name', label: t(`${prefix}.contact`), value: (r) => r.name || t('reports.unknownContact') },
        { id: 'count', label: t('reports.col.count'), align: 'num', value: (r) => r.count },
        { id: 'net', label: t('reports.col.net'), ...money('net') },
        { id: 'gross', label: t('reports.col.gross'), ...money('gross') }
      ]
    }),
    reportTable({
      title: t('reports.byItem'), fileName: file('items'), rows: report.byItem,
      columns: [
        { id: 'name', label: t('reports.col.item'), value: (r) => r.name },
        { id: 'qty', label: t('reports.col.qty'), align: 'num', value: (r) => decimalComma(r.qty), render: (r) => `${decimalComma(r.qty)} ${r.unit || ''}`.trim() },
        { id: 'net', label: t('reports.col.net'), ...money('net') }
      ]
    }),
    h('div', { class: 'report-pair' },
      reportTable({
        title: t('reports.byLabel'), fileName: file('labels'), rows: report.byLabel, empty: t('reports.noLabels'),
        columns: [{ id: 'key', label: t('reports.col.label'), value: (r) => r.key }, { id: 'count', label: t('reports.col.count'), align: 'num', value: (r) => r.count }, { id: 'net', label: t('reports.col.net'), ...money('net') }]
      }),
      reportTable({
        title: t('reports.byProject'), fileName: file('projects'), rows: report.byProject, empty: t('reports.noProjects'),
        columns: [{ id: 'key', label: t('reports.project'), value: (r) => r.key || t('reports.noProject') }, { id: 'count', label: t('reports.col.count'), align: 'num', value: (r) => r.count }, { id: 'net', label: t('reports.col.net'), ...money('net') }]
      }))]);
}
