// The columns of a sales list (07-ui-ux-i18n.md § 7.3): number, kind,
// client, dates, status with the eFaktura badge, amounts with totals per
// currency at the bottom. The user may hide any but the number.
import { h } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { formatAmount } from '../../components/decimal.js';
import { formatDate } from '../../components/dates.js';
import { statusBadge } from '../../components/status-badge.js';
import { sumByCurrency } from './rows.js';
import { showsPrices } from './kinds.js';

const money = (row, field) => formatAmount(row[field], row.currency);

function total(field) {
  return (rows) => {
    const sums = sumByCurrency(rows, field);
    return sums.length ? sums.map(s => formatAmount(s.amount, s.currency)).join(' · ') : null;
  };
}

/** Status badge plus the eFaktura duty and the Peppol state of the document. */
export function statusCell(row) {
  const parts = [statusBadge(row.status)];
  if (row.peppolStatus) parts.push(h('span', { class: 'badge badge-peppol', dataset: { peppol: row.peppolStatus } }, t(`documents.peppol.status.${row.peppolStatus}`)));
  else if (row.peppol && row.peppol.requirement === 'MANDATORY') parts.push(h('span', { class: 'badge badge-efaktura', title: t(row.peppol.reason) }, t('documents.list.efakturaMandatory')));
  return h('span', { class: 'status-cell' }, parts);
}

export function listColumns(config) {
  const multiKind = config.kinds.length > 1;
  const prices = config.kinds.some(showsPrices);
  const payable = config.kinds.some(k => !['QUOTE', 'ORDER_IN', 'ORDER_OUT', 'DELIVERY_NOTE'].includes(k));
  const columns = [
    {
      id: 'number', label: t('documents.col.number'), always: true, sortValue: (r) => r.number || '',
      render: (r) => (r.number ? h('span', { class: 'doc-number' }, r.number) : h('span', { class: 'muted' }, t('documents.list.noNumber')))
    },
    multiKind ? { id: 'kind', label: t('documents.col.kind'), sortValue: (r) => r.kind, render: (r) => t(`document.kind.${r.kind}`), cardHidden: true } : null,
    { id: 'contact', label: t('documents.col.contact'), sortValue: (r) => r.contactName, render: (r) => r.contactName || h('span', { class: 'muted' }, t('documents.list.noContact')) },
    { id: 'issueDate', label: t('documents.col.issueDate'), sortValue: (r) => r.issueDate || '', render: (r) => formatDate(r.issueDate) },
    payable ? { id: 'dueDate', label: t('documents.col.dueDate'), sortValue: (r) => r.dueDate || '', render: (r) => formatDate(r.dueDate) } : null,
    { id: 'status', label: t('documents.col.status'), sortValue: (r) => r.status, render: statusCell },
    prices ? { id: 'net', label: t('documents.col.net'), align: 'num', hidden: true, sortValue: (r) => Number(r.net), render: (r) => money(r, 'net'), total: total('net') } : null,
    prices ? { id: 'vat', label: t('documents.col.vat'), align: 'num', hidden: true, sortValue: (r) => Number(r.vat), render: (r) => money(r, 'vat'), total: total('vat') } : null,
    prices ? { id: 'gross', label: t('documents.col.gross'), align: 'num', primary: true, sortValue: (r) => Number(r.gross), render: (r) => money(r, 'gross'), total: total('gross') } : null,
    payable ? { id: 'due', label: t('documents.col.due'), align: 'num', sortValue: (r) => Number(r.due), render: (r) => money(r, 'due'), total: total('due') } : null
  ];
  return columns.filter(Boolean);
}
