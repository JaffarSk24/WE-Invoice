// The "Prijaté eFaktúry" screen (route efaktury-in, 04-peppol.md § 4.7):
// documents received through Peppol, the "receive now" button and when
// the last one came. Each received e-invoice is also a received invoice
// "to process" in the purchase screens; this list only adds its Peppol
// side (provider, warnings about totals).
import { h, icon } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { on } from '../../events.js';
import { showToast, showError } from '../../ui/toast.js';
import { formatAmount } from '@we-invoice/core';
import { createTable } from '../../components/table.js';
import { emptyState } from '../../components/empty-state.js';
import { formatDate, formatDateTime } from '../../components/dates.js';
import { statusBadge } from '../../components/status-badge.js';
import { navItem } from '../shell/nav.js';
import { getPeppolService } from '../../peppol/runtime.js';
import { efakturyData } from './data.js';
import { inRows, lastReceivedAt } from './rows.js';
import { openPeppolDetail } from './common.js';

export function inColumns() {
  return [
    { id: 'number', label: t('peppol.col.number'), render: r => r.number, primary: true, always: true, sortValue: r => r.number },
    { id: 'partner', label: t('peppol.col.partner'), render: r => r.partner, sortValue: r => r.partner },
    { id: 'issueDate', label: t('peppol.col.issueDate'), render: r => (r.issueDate ? formatDate(r.issueDate) : ''), sortValue: r => r.issueDate },
    { id: 'receivedDate', label: t('peppol.col.receivedDate'), render: r => (r.receivedDate ? formatDate(r.receivedDate) : ''), sortValue: r => r.receivedDate },
    { id: 'total', label: t('peppol.col.total'), align: 'num', render: r => (r.total ? formatAmount(r.total, r.currency) : ''), sortValue: r => Number(r.total || 0) },
    {
      id: 'status', label: t('peppol.col.status'),
      render: r => h('span', { class: 'peppol-in-status' }, statusBadge(r.status), r.warnings ? h('span', { class: 'peppol-warning', title: t('peppol.in.warnings'), 'aria-label': t('peppol.in.warnings') }, icon('triangle-alert')) : null),
      sortValue: r => r.status
    }
  ];
}

export async function receiveNow({ demo }) {
  if (demo) {
    showToast(t('peppol.demo.readOnly'), { type: 'info' });
    return null;
  }
  const service = await getPeppolService();
  if (!service) return null;
  const summary = await service.receiveNow();
  if (summary.stored) showToast(t('peppol.in.received', { n: summary.stored }), { type: 'success' });
  else if (!summary.failed.length) showToast(t('peppol.in.nothingNew'), { type: 'info' });
  if (summary.failed.length) showToast(t('peppol.in.someFailed', { n: summary.failed.length }), { type: 'error' });
  return summary;
}

export function renderIn(root) {
  const item = navItem('efaktury-in');
  const last = h('p', { class: 'muted small peppol-last', 'aria-live': 'polite' });
  const button = h('button', { type: 'button', class: 'btn btn-primary', dataset: { action: 'receive-now' } }, icon('refresh-cw'), t('peppol.in.receiveNow'));
  button.addEventListener('click', async () => {
    button.disabled = true;
    last.textContent = t('peppol.in.receiving');
    try {
      await receiveNow(efakturyData());
    } catch (error) {
      showError(error);
    } finally {
      button.disabled = false;
      draw();
    }
  });

  const openRow = (row) => openPeppolDetail(row.document, {
    actions: [{ label: t('peppol.in.openReceived'), kind: 'primary', onClick: (m) => { m.close(); window.location.hash = `#/received/${row.id}`; } }]
  });
  const table = createTable({
    key: 'efaktury-in', columns: inColumns(), rows: [], onRowClick: openRow,
    empty: emptyState({ title: t('peppol.in.empty'), text: t('peppol.in.emptyText'), iconName: 'inbox' })
  });

  function draw() {
    const data = efakturyData();
    table.setRows(inRows(data.documents));
    const at = lastReceivedAt(data.documents);
    last.textContent = at ? t('peppol.in.lastReceived', { date: formatDateTime(at) }) : '';
  }

  root.append(
    h('header', { class: 'view-header' },
      h('h1', {}, item ? t(item.label) : t('peppol.in.title'), ' ', h('span', { class: 'badge peppol-beta' }, t('peppol.beta.badge'))),
      button),
    h('p', { class: 'muted' }, t('peppol.in.text')),
    last,
    h('div', { class: 'peppol-list' }, table.el));
  draw();
  refreshIcons(root);
  const offs = ['data:changed', 'peppol:received', 'company:switched', 'demo:enabled', 'demo:disabled'].map(ev => on(ev, () => {
    if (!root.isConnected) return offs.forEach(off => off());
    draw();
  }));
}
