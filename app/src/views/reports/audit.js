// The change log screen (#/audit, or #/audit/<record id> for the history
// of one record): who changed what and when, newest first, filtered by
// dates, kind of change, kind of record and text. Field values are shown
// only where the log keeps them (status, number, dates).
import { h, selectEl, clear, append } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { on } from '../../events.js';
import { navigate } from '../../router.js';
import { filterAudit, AUDITED_COLLECTIONS, schema } from '@we-invoice/core';
import { formatDateTime } from '../../components/dates.js';
import { dateField, textField } from '../../components/fields.js';
import { emptyState } from '../../components/empty-state.js';
import { reportData } from './data.js';
import { reportTable } from './table.js';
import { routeFor } from '../search/engine.js';
import '../../style/reports.css';

const COLLECTION_OF = Object.fromEntries(Object.entries(AUDITED_COLLECTIONS).map(([c, e]) => [e, c]));
const TYPE_OF = { contacts: 'contact', items: 'item' };

/** The record id of a "#/audit/<id>" address, or null. */
export function entityIdFromHash(hash) {
  const parts = String(hash || '').replace(/^#\/?/, '').split(/[/?]/);
  return parts[0] === 'audit' && parts[1] ? decodeURIComponent(parts[1]) : null;
}

function names(data) {
  const map = new Map();
  data.documents.forEach(d => map.set(d.id, { label: d.number || t(`document.kind.${d.kind}`), kind: d.kind }));
  data.contacts.forEach(c => map.set(c.id, { label: c.name }));
  data.items.forEach(i => map.set(i.id, { label: i.name }));
  data.recurringTemplates.forEach(r => map.set(r.id, { label: r.name }));
  return map;
}

/** A field name as people read it; an unlisted field keeps its technical name. */
export function fieldLabel(field) {
  const key = `reports.audit.fieldName.${field}`;
  const label = t(key);
  return label === key ? field : label;
}

export function describeChange(change) {
  const field = fieldLabel(change.field);
  if (!('from' in change) && !('to' in change)) return field;
  return t('reports.audit.fromTo', { field, from: change.from ?? '-', to: change.to ?? '-' });
}

function openEntry(entry, known) {
  const collection = COLLECTION_OF[entry.entity];
  if (collection === 'recurringTemplates') return navigate(`recurring/${entry.entityId}`);
  const kind = known && known.kind;
  const type = collection === 'documents' ? (/^RECEIVED|EXPENSE/.test(kind || '') ? 'received' : 'document') : TYPE_OF[collection];
  const route = routeFor({ type, kind, id: entry.entityId });
  if (route) navigate(route);
}

let offs = [];

export function renderAudit(root) {
  offs.forEach(off => off());
  offs = [];
  const filter = { from: null, to: null, action: '', entity: '', text: '', entityId: entityIdFromHash(window.location.hash) };
  const out = h('div', { class: 'audit-results' });
  const from = dateField({ label: t('filter.from') });
  const to = dateField({ label: t('filter.to') });
  const action = selectEl([{ value: '', label: t('reports.audit.anyAction') }, ...schema.AUDIT_ACTIONS.map(a => ({ value: a, label: t(`reports.audit.action.${a}`) }))], '', { 'aria-label': t('reports.audit.action') });
  const entity = selectEl([{ value: '', label: t('reports.audit.anyEntity') }, ...Object.values(AUDITED_COLLECTIONS).map(e => ({ value: e, label: t(`reports.audit.entity.${e}`) }))], '', { 'aria-label': t('reports.audit.entity') });
  const text = textField({ label: null, placeholder: t('reports.audit.searchPlaceholder'), attrs: { 'aria-label': t('reports.audit.searchPlaceholder') } });

  const draw = () => {
    clear(out);
    const data = reportData();
    if (!data.ready) {
      out.append(emptyState({ title: t('reports.audit.empty'), text: t('reports.audit.emptyText'), iconName: 'notebook-pen' }));
      return;
    }
    const known = names(data);
    const entries = filterAudit(data.auditLog, filter);
    out.append(reportTable({
      title: filter.entityId ? t('reports.audit.historyOf', { name: (known.get(filter.entityId) || {}).label || filter.entityId }) : t('reports.audit.entries'),
      fileName: `${t('reports.audit.file')}-${new Date().toISOString().slice(0, 10)}`,
      rows: entries, empty: t('reports.audit.empty'),
      onRowClick: (row) => openEntry(row, known.get(row.entityId)),
      columns: [
        { id: 'at', label: t('reports.audit.when'), value: (r) => r.at, render: (r) => formatDateTime(r.at) },
        { id: 'actor', label: t('reports.audit.who'), value: (r) => [r.actor, r.device].filter(Boolean).join(', ') || t('reports.audit.thisDevice') },
        { id: 'action', label: t('reports.audit.action'), value: (r) => t(`reports.audit.action.${r.action}`) + (r.reason === 'restore' ? ` (${t('reports.audit.restored')})` : '') },
        { id: 'entity', label: t('reports.audit.entity'), value: (r) => t(`reports.audit.entity.${r.entity}`) },
        { id: 'record', label: t('reports.audit.record'), value: (r) => (known.get(r.entityId) || {}).label || t('reports.audit.deletedRecord') },
        { id: 'changes', label: t('reports.audit.changes'), value: (r) => (r.changes || []).map(describeChange).join('; ') }
      ]
    }));
    refreshIcons(out);
  };

  [[from, 'from'], [to, 'to']].forEach(([f, key]) => f.input.addEventListener('change', () => { filter[key] = f.value(); draw(); }));
  action.addEventListener('change', () => { filter.action = action.value; draw(); });
  entity.addEventListener('change', () => { filter.entity = entity.value; draw(); });
  let timer = null;
  text.input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { filter.text = text.value(); draw(); }, 150); });

  append(root, [
    h('header', { class: 'view-header' }, h('h1', {}, t('reports.audit.title')),
      filter.entityId ? h('div', { class: 'view-actions' }, h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => navigate('audit') }, t('reports.audit.showAll'))) : null),
    h('p', { class: 'muted view-intro' }, t('reports.audit.intro')),
    h('div', { class: 'filter-bar', role: 'search', 'aria-label': t('reports.audit.filters') },
      h('div', { class: 'filter-row' }, action, entity, text.el), h('div', { class: 'filter-custom' }, from.el, to.el)),
    out]);
  draw();
  ['data:changed', 'company:switched', 'demo:enabled', 'demo:disabled'].forEach(ev => offs.push(on(ev, () => { if (out.isConnected) draw(); })));
}
