// The recycle bin screen (#/trash): deleted drafts, contacts, price list
// items and recurring templates, restorable for 30 days; deleted issued
// documents stay restorable and are never removed for good (accounting
// archive). Nothing is written in sample data mode or on read-only data.
import { h, icon, clear } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { on } from '../../events.js';
import { navigate } from '../../router.js';
import { trashEntries, TRASH_RETENTION_DAYS } from '@we-invoice/core';
import { formatDate, formatDateTime } from '../../components/dates.js';
import { emptyState } from '../../components/empty-state.js';
import { confirmIrreversible } from '../../components/confirm-irreversible.js';
import { showToast, showError } from '../../ui/toast.js';
import { reportData, writableStore } from './data.js';
import { restoreRecord, purgeRecord } from './trash-store.js';
import { routeFor } from '../search/engine.js';
import '../../style/reports.css';

const ENTITY_KEYS = Object.freeze({ contacts: 'contact', items: 'item', recurringTemplates: 'recurring' });

export function entryType(entry) {
  if (entry.collection === 'documents') return entry.kind ? t(`document.kind.${entry.kind}`) : t('reports.trash.type.document');
  return t(`reports.trash.type.${ENTITY_KEYS[entry.collection]}`);
}

export function entryRoute(entry) {
  if (entry.collection === 'recurringTemplates') return `recurring/${entry.id}`;
  const type = entry.collection === 'documents' ? (/^RECEIVED|EXPENSE/.test(entry.kind || '') ? 'received' : 'document') : ENTITY_KEYS[entry.collection];
  return routeFor({ type, kind: entry.kind, id: entry.id });
}

function store() {
  const s = writableStore();
  if (!s) showToast(t(reportData().demo ? 'reports.demoReadOnly' : 'errors.READ_ONLY'), { type: 'info' });
  return s;
}

async function restore(entry) {
  const s = store();
  if (!s) return;
  try {
    await restoreRecord(s, entry.collection, entry.id);
    showToast(t('reports.trash.restored', { name: entry.title || entryType(entry) }), { type: 'success', actionLabel: t('reports.trash.open'), onAction: () => navigate(entryRoute(entry)) });
  } catch (e) {
    if (e && e.code === 'TRASH_NUMBER_TAKEN') { showToast(t('errors.TRASH_NUMBER_TAKEN', e.details), { type: 'error', duration: 8000 }); return; }
    showError(e, 'errors.TRASH_RESTORE_FAILED');
  }
}

async function purge(entry) {
  const s = store();
  if (!s) return;
  const ok = await confirmIrreversible({
    title: t('reports.trash.purgeTitle'), message: t('reports.trash.purgeText', { name: entry.title || entryType(entry) }),
    okLabel: t('reports.trash.purge')
  });
  if (!ok) return;
  try {
    await purgeRecord(s, entry.collection, entry.id);
    showToast(t('reports.trash.purged'), { type: 'success' });
  } catch (e) {
    showError(e, 'errors.TRASH_PURGE_FAILED');
  }
}

function row(entry) {
  return h('li', { class: 'trash-row card', dataset: { id: entry.id, collection: entry.collection } },
    h('div', { class: 'trash-main' },
      h('strong', {}, entry.title || t('reports.trash.untitled')),
      h('span', { class: 'muted' }, [entryType(entry), entry.subtitle].filter(Boolean).join(' \u00b7 ')),
      h('span', { class: 'muted trash-when' }, t('reports.trash.deletedAt', { when: formatDateTime(entry.deletedAt) })),
      h('span', { class: 'muted trash-when' }, entry.archived ? t('reports.trash.archived') : t('reports.trash.expires', { date: formatDate(entry.expiresAt.slice(0, 10)) }))),
    h('div', { class: 'trash-actions' },
      h('button', { type: 'button', class: 'btn btn-sm trash-restore', onclick: () => restore(entry) }, icon('rotate-ccw'), t('reports.trash.restore')),
      entry.canPurge ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm trash-purge', onclick: () => purge(entry) }, icon('circle-x'), t('reports.trash.purge')) : null));
}

let offs = [];

export function renderTrash(root) {
  offs.forEach(off => off());
  offs = [];
  const list = h('div', { class: 'trash-list' });
  const draw = () => {
    clear(list);
    const data = reportData({ includeDeleted: true });
    const entries = data.ready ? trashEntries(data, { now: new Date().toISOString() }) : [];
    if (!entries.length) {
      list.append(emptyState({ title: t('reports.trash.empty'), text: t('reports.trash.emptyText', { days: TRASH_RETENTION_DAYS }), iconName: 'archive' }));
    } else {
      list.append(h('ul', { class: 'trash-rows' }, entries.map(row)));
    }
    refreshIcons(list);
  };
  root.append(
    h('header', { class: 'view-header' }, h('h1', {}, t('reports.trash.title'))),
    h('p', { class: 'muted view-intro' }, t('reports.trash.intro', { days: TRASH_RETENTION_DAYS })),
    list);
  draw();
  ['data:changed', 'company:switched', 'demo:enabled', 'demo:disabled'].forEach(ev => offs.push(on(ev, (p) => {
    if (p && p.collection === 'auditLog') return;
    if (list.isConnected) draw();
  })));
}
