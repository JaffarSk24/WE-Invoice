// The lists of received invoices and of expenses (receipts): filter bar,
// table with totals, and for expenses a summary by category with the
// input VAT to deduct. Rows open the review; "Nahrať" goes to the Inbox,
// "Zadať ručne" opens an empty document.
import { h, icon } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { on } from '../../events.js';
import { navigate } from '../../router.js';
import { createTable } from '../../components/table.js';
import { createFilterBar } from '../../components/filter-bar.js';
import { emptyState } from '../../components/empty-state.js';
import { inRange } from '../../components/dates.js';
import { formatAmount } from '../../components/decimal.js';
import { listRows } from './data.js';
import { listColumns, categoryLabel } from './columns.js';
import { categorySummary } from './summary.js';
import { docHash } from './routes.js';

const STATUSES = ['PROCESSED', 'PARTIALLY_PAID', 'PAID', 'OVERPAID', 'OVERDUE', 'BOOKED', 'CANCELLED'];

export function filterRows(rows, filter) {
  const contact = String(filter.contact || '').trim().toLowerCase();
  const label = String(filter.label || '').trim().toLowerCase();
  return rows.filter(r => (!filter.from && !filter.to ? true : inRange(r.issueDate, filter))
    && (!filter.status || r.status === filter.status)
    && (!filter.currency || r.currency === filter.currency)
    && (!contact || `${r.supplier} ${r.number}`.toLowerCase().includes(contact))
    && (!label || categoryLabel(r.category).toLowerCase().includes(label)));
}

function summaryCard(rows) {
  const lines = categorySummary(rows);
  if (!lines.length) return null;
  return h('section', { class: 'card expense-summary', 'aria-label': t('purchase.summary.title') },
    h('h2', { class: 'section-title' }, t('purchase.summary.title')),
    h('table', { class: 'table density-compact' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, t('purchase.col.category')), h('th', { scope: 'col', class: 'num' }, t('purchase.col.total')),
        h('th', { scope: 'col', class: 'num' }, t('purchase.summary.deductible')))),
      h('tbody', {}, lines.map(l => h('tr', {}, h('td', {}, l.category ? categoryLabel(l.category) : t('purchase.category.none')),
        h('td', { class: 'num' }, formatAmount(l.total, l.currency)), h('td', { class: 'num' }, formatAmount(l.deductibleVat, l.currency)))))));
}

/**
 * @param {{route: string, kinds: string[], titleKey: string, newKind: string, emptyKey: string, summary?: boolean}} spec
 */
export function renderList(root, spec) {
  let filter = null;
  const summaryBox = h('div', {});
  const table = createTable({
    key: `purchase-${spec.route}`, columns: listColumns({ withDue: !spec.summary }), rows: [],
    onRowClick: (row) => navigate(docHash(spec.route, row.id)),
    empty: emptyState({
      title: t(`${spec.emptyKey}.title`), text: t(`${spec.emptyKey}.text`), iconName: spec.summary ? 'receipt' : 'file-check',
      actionLabel: t('purchase.list.upload'), onAction: () => navigate('inbox'), actionIcon: 'inbox'
    })
  });
  const refresh = () => {
    const rows = listRows(spec.kinds);
    const shown = filter ? filterRows(rows, filter) : rows;
    table.setRows(shown);
    if (spec.summary) {
      summaryBox.replaceChildren();
      const card = summaryCard(shown);
      if (card) summaryBox.append(card);
    }
  };
  const bar = createFilterBar({ key: `purchase-${spec.route}`, statuses: STATUSES, currencies: ['EUR', 'CZK', 'USD'], onChange: (f) => { filter = f; refresh(); } });
  filter = bar.value();
  root.append(
    h('header', { class: 'view-header' }, h('h1', {}, t(spec.titleKey)),
      h('div', { class: 'view-actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => navigate(`${spec.route}/new`) }, icon('pencil-line'), t('purchase.list.manual')),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => navigate('inbox') }, icon('inbox'), t('purchase.list.upload')))),
    bar.el, summaryBox, table.el);
  refresh();
  refreshIcons(root);
  const off = on('data:changed', ({ collection } = {}) => {
    if (!root.isConnected) { off(); return; }
    if (collection === 'documents' || collection === 'company') refresh();
  });
}
