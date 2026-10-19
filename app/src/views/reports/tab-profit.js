// The profitability tab: revenue less the purchase cost of what was sold,
// by item and by client, and sales less purchases by project. Where an
// item was never bought, its cost is unknown and the row says so.
import { h, append } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { navigate } from '../../router.js';
import { profitability, sum, decimalComma } from '@we-invoice/core';
import { reportTable } from './table.js';
import { eur, summaryCards } from './format.js';

const money = (field) => ({ align: 'num', value: (r) => decimalComma(r[field]), render: (r) => eur(r[field]), total: (rows) => eur(sum(rows.map(r => r[field] || '0'))) });

function columns(nameLabel, nameOf) {
  return [
    { id: 'name', label: nameLabel, value: nameOf },
    { id: 'revenue', label: t('reports.profit.revenue'), ...money('revenue') },
    { id: 'cost', label: t('reports.profit.cost'), ...money('cost'), render: (r) => (r.costKnown ? eur(r.cost) : t('reports.profit.costPartial', { cost: eur(r.cost) })) },
    { id: 'profit', label: t('reports.profit.profit'), ...money('profit') },
    { id: 'margin', label: t('reports.profit.margin'), align: 'num', value: (r) => (r.margin === null ? '' : decimalComma(r.margin)), render: (r) => (r.margin === null ? '' : t('reports.percent', { value: decimalComma(r.margin) })) }
  ];
}

export function renderProfitPanel(panel, { data, period }) {
  const report = profitability(data.documents, { from: period.from, to: period.to });
  const file = (part) => `${t('reports.profit.file')}-${part}-${period.from || ''}-${period.to || ''}`;
  const unknown = report.byItem.filter(r => !r.costKnown).length;
  append(panel, [
    h('p', { class: 'muted report-note' }, t('reports.profit.note')),
    summaryCards([
      { label: t('reports.profit.revenue'), value: eur(sum(report.byContact.map(r => r.revenue))) },
      { label: t('reports.profit.cost'), value: eur(sum(report.byContact.map(r => r.cost))) },
      { label: t('reports.profit.profit'), value: eur(sum(report.byContact.map(r => r.profit))) },
      { label: t('reports.profit.unknownItems'), value: String(unknown), tone: unknown ? 'warn' : null }
    ]),
    reportTable({ title: t('reports.profit.byItem'), fileName: file('items'), rows: report.byItem, columns: columns(t('reports.col.item'), (r) => r.name) }),
    reportTable({
      title: t('reports.profit.byContact'), fileName: file('contacts'), rows: report.byContact,
      onRowClick: (row) => { if (row.id) navigate(`contacts/${row.id}`); },
      columns: columns(t('reports.col.contact'), (r) => r.name || t('reports.unknownContact'))
    }),
    reportTable({ title: t('reports.profit.byProject'), fileName: file('projects'), rows: report.byProject, empty: t('reports.noProjects'), columns: columns(t('reports.project'), (r) => r.key) })]);
}
