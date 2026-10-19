// The "Odoslané eFaktúry" screen (route efaktury-out, 04-peppol.md § 4.6):
// every tax document that has gone or must go through Peppol, its state,
// the days left to the 15-day deadline, sending one or several at once, a
// retry of a failed one and the archived XML for download.
import { h } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { on } from '../../events.js';
import { showToast, showError } from '../../ui/toast.js';
import { formatAmount } from '@we-invoice/core';
import { createTable } from '../../components/table.js';
import { emptyState } from '../../components/empty-state.js';
import { formatDate, todayLocal } from '../../components/dates.js';
import { navItem } from '../shell/nav.js';
import { getPeppolService } from '../../peppol/runtime.js';
import { createArchive } from '../../peppol/archive.js';
import { efakturyData } from './data.js';
import { outRows, filterOut } from './rows.js';
import { peppolBadge, openPeppolDetail } from './common.js';

const FILTERS = ['all', 'waiting', 'problems', 'delivered'];

function deadlineCell(row) {
  if (row.daysLeft === null || row.daysLeft === undefined) return '';
  const late = row.daysLeft < 0;
  return h('span', { class: `peppol-deadline ${late ? 'is-late' : row.daysLeft <= 3 ? 'is-near' : ''}`.trim() },
    late ? t('peppol.deadline.late') : t('peppol.deadline.days', { n: row.daysLeft }));
}

export function outColumns() {
  return [
    { id: 'number', label: t('peppol.col.number'), render: r => r.number, primary: true, always: true, sortValue: r => r.number },
    { id: 'partner', label: t('peppol.col.partner'), render: r => r.partner, sortValue: r => r.partner },
    { id: 'issueDate', label: t('peppol.col.issueDate'), render: r => (r.issueDate ? formatDate(r.issueDate) : ''), sortValue: r => r.issueDate },
    { id: 'total', label: t('peppol.col.total'), align: 'num', render: r => (r.total ? formatAmount(r.total, r.currency) : ''), sortValue: r => Number(r.total || 0) },
    { id: 'status', label: t('peppol.col.status'), render: r => peppolBadge(r.status), sortValue: r => r.status },
    { id: 'deadline', label: t('peppol.col.deadline'), render: deadlineCell, sortValue: r => (r.daysLeft ?? 9999) }
  ];
}

// Sends documents through the service and reports the outcome in one toast.
export async function sendDocuments(rows, { demo }) {
  if (demo) {
    showToast(t('peppol.demo.readOnly'), { type: 'info' });
    return;
  }
  const service = await getPeppolService();
  if (!service) return;
  const ids = rows.filter(r => r.sendable).map(r => r.id);
  if (!ids.length) return;
  if (ids.length > 1) showToast(t('peppol.out.sending', { n: ids.length }), { type: 'info' });
  const results = await service.sendMany(ids);
  const ok = results.filter(r => r.document && ['ACCEPTED', 'DELIVERED'].includes(r.document.peppol?.status));
  if (ids.length === 1) {
    const r = results[0];
    if (r.error) return showError(r.error);
    const number = r.document.number || '';
    const status = r.document.peppol?.status;
    if (ok.length) showToast(t('peppol.out.sent', { number }), { type: 'success' });
    else if (status === 'FAILED' && r.document.peppol.nextAttemptAt) showToast(t('peppol.out.failed', { number }), { type: 'info' });
    else if (status === 'FAILED') showError({ code: r.document.peppol.errors?.[0]?.code });
    else showToast(t('peppol.out.invalid', { number }), { type: 'error' });
    return;
  }
  showToast(t('peppol.out.sentMany', { ok: ok.length, failed: ids.length - ok.length }), { type: ok.length === ids.length ? 'success' : 'info' });
}

async function downloadXml(document, company, transport) {
  try {
    const xml = await createArchive().readXml(company.id, document.peppol.xmlFileId);
    if (!xml) throw Object.assign(new Error('not in the archive'), { code: 'PEPPOL_ARCHIVE_UNAVAILABLE' });
    await transport.files.saveAs(`${document.number || document.id}.xml`, new Blob([xml], { type: 'application/xml' }));
  } catch (error) {
    showError(error, 'errors.PEPPOL_ARCHIVE_UNAVAILABLE');
  }
}

export function renderOut(root, { transport }) {
  let filter = 'all';
  const item = navItem('efaktury-out');
  const tabs = h('div', { class: 'segmented peppol-filter', role: 'group', 'aria-label': t('peppol.col.status') });
  const listBox = h('div', { class: 'peppol-list' });

  function current() {
    const data = efakturyData();
    const contacts = new Map(data.contacts.map(c => [c.id, c]));
    return { data, rows: data.company ? outRows(data.documents, data.company, contacts, todayLocal()) : [] };
  }

  const openRow = (row) => {
    const { data } = current();
    const actions = [];
    if (row.sendable) actions.push({ label: row.status === 'NOT_SENT' ? t('peppol.out.send') : t('peppol.out.retry'), kind: 'primary', onClick: (m) => { m.close(); sendDocuments([row], data).catch(showError); } });
    if (!data.demo && row.document.peppol?.xmlFileId) actions.push({ label: t('peppol.out.downloadXml'), onClick: () => downloadXml(row.document, data.company, transport) });
    openPeppolDetail(row.document, { actions });
  };

  const table = createTable({
    key: 'efaktury-out', columns: outColumns(), rows: [], selectable: true, onRowClick: openRow,
    bulkActions: [{ label: t('peppol.out.sendSelected'), icon: 'send', onClick: (rows) => sendDocuments(rows, current().data).catch(showError) }],
    empty: emptyState({ title: t('peppol.out.empty'), text: t('peppol.out.emptyText'), iconName: 'send' })
  });

  function drawTabs(rows) {
    tabs.replaceChildren(...FILTERS.map(f => h('button', {
      type: 'button', class: 'segment', 'aria-pressed': f === filter ? 'true' : 'false', dataset: { filter: f },
      onclick: () => { filter = f; draw(); }
    }, t(`peppol.out.filter.${f}`), ' ', h('span', { class: 'peppol-count' }, String(filterOut(rows, f).length)))));
  }

  function draw() {
    const { rows } = current();
    drawTabs(rows);
    table.setRows(filterOut(rows, filter));
  }

  root.append(
    h('header', { class: 'view-header' },
      h('h1', {}, item ? t(item.label) : t('peppol.out.title'), ' ', h('span', { class: 'badge peppol-beta' }, t('peppol.beta.badge')))),
    h('p', { class: 'muted' }, t('peppol.out.text')),
    tabs,
    listBox);
  listBox.append(table.el);
  draw();
  refreshIcons(root);
  const offs = ['data:changed', 'peppol:status', 'company:switched', 'demo:enabled', 'demo:disabled'].map(ev => on(ev, () => {
    if (!root.isConnected) return offs.forEach(off => off());
    draw();
  }));
}
