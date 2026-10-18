// Columns of the purchase lists (Inbox queue, received invoices, receipts)
// for the shared table component, and small cells used by several screens.
import { h } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { formatAmount, sum } from '../../components/decimal.js';
import { formatDate } from '../../components/dates.js';
import { statusBadge } from '../../components/status-badge.js';

/** "92 %" chip of the recognition confidence; amber below 0.7. */
export function confidenceChip(confidence, needsConfirmation) {
  if (confidence === null || confidence === undefined) return '';
  const pct = Math.round(confidence * 100);
  const low = needsConfirmation && confidence < 0.7;
  return h('span', { class: `conf-chip ${low ? 'is-low' : ''}`.trim(), title: t(needsConfirmation ? 'purchase.confidence.check' : 'purchase.confidence.structured') },
    t('purchase.confidence.value', { pct }));
}

export function categoryLabel(id) {
  return id ? t(`purchase.category.${id}`) : '';
}

const totalOf = (rows) => {
  const currencies = [...new Set(rows.map(r => r.currency))];
  return currencies.length === 1 ? formatAmount(sum(rows.map(r => r.total)), currencies[0]) : '';
};

export function listColumns({ withCategory = true, withDue = true } = {}) {
  return [
    { id: 'supplier', label: t('purchase.col.supplier'), render: r => r.supplier || t('purchase.unknownSupplier'), always: true, sortValue: r => r.supplier },
    { id: 'number', label: t('purchase.col.number'), render: r => r.number, sortValue: r => r.number },
    { id: 'issueDate', label: t('purchase.col.issueDate'), render: r => formatDate(r.issueDate), sortValue: r => r.issueDate || '' },
    withDue ? { id: 'dueDate', label: t('purchase.col.dueDate'), render: r => formatDate(r.dueDate), sortValue: r => r.dueDate || '' } : null,
    withCategory ? { id: 'category', label: t('purchase.col.category'), render: r => categoryLabel(r.category), sortValue: r => categoryLabel(r.category) } : null,
    { id: 'vat', label: t('purchase.col.vat'), align: 'num', hidden: true, render: r => formatAmount(r.vat, r.currency), sortValue: r => Number(r.vat) },
    { id: 'total', label: t('purchase.col.total'), align: 'num', primary: true, render: r => formatAmount(r.total, r.currency), sortValue: r => Number(r.total), total: totalOf },
    { id: 'status', label: t('purchase.col.status'), render: r => statusBadge(r.status), sortValue: r => r.status }
  ].filter(Boolean);
}

export function inboxColumns() {
  return [
    { id: 'supplier', label: t('purchase.col.supplier'), render: r => r.supplier || t('purchase.unknownSupplier'), always: true, sortValue: r => r.supplier },
    { id: 'kind', label: t('purchase.col.kind'), render: r => t(`document.kind.${r.kind}`), sortValue: r => r.kind },
    { id: 'number', label: t('purchase.col.number'), render: r => r.number },
    { id: 'issueDate', label: t('purchase.col.issueDate'), render: r => formatDate(r.issueDate), sortValue: r => r.issueDate || '' },
    { id: 'confidence', label: t('purchase.col.confidence'), render: r => confidenceChip(r.confidence, r.needsConfirmation), sortValue: r => r.confidence ?? 0 },
    { id: 'total', label: t('purchase.col.total'), align: 'num', primary: true, render: r => formatAmount(r.total, r.currency), sortValue: r => Number(r.total) }
  ];
}
