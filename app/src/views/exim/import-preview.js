// The preview of an import: per table the column mapping (entity and the
// column of every field, editable), then what the plan would do: new
// contacts, items and documents, contacts linked to existing ones, and
// every skipped record with its reason. Nothing is written here.
import { h, selectEl, append, clear } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { importFields } from './core-bridge.js';
import { reasonText } from './labels.js';
import { formatAmount } from '../../components/decimal.js';
import { formatDate } from '../../components/dates.js';
import { computeTotals } from '@we-invoice/core';

const ENTITIES = ['documents', 'contacts', 'items'];
const SAMPLE = 20;

/** Mapping editors; onChange(name, { entity, mapping }) when the user corrects one. */
export function mappingEditors(tables, onChange) {
  return tables.map((table, n) => {
    const columns = [{ value: '', label: t('exim.import.notMapped') }, ...table.header.map((name, i) => ({ value: String(i), label: name || `#${i + 1}` }))];
    const entity = selectEl(ENTITIES.map(e => ({ value: e, label: t(`exim.entity.${e}`) })), table.entity, { id: `exim-map-${n}-entity`, 'aria-label': t('exim.import.entity') });
    const fields = h('div', { class: 'exim-map-fields' });
    const draw = (current, mapping) => {
      append(clear(fields), [...importFields(current).map(field => {
        const id = `exim-map-${n}-${field}`;
        const select = selectEl(columns, mapping[field] !== undefined ? String(mapping[field]) : '', { id });
        select.addEventListener('change', () => {
          const next = { ...mapping };
          if (select.value === '') delete next[field]; else next[field] = Number(select.value);
          onChange(table.name, { entity: current, mapping: next });
        });
        return h('div', { class: 'exim-map-field' }, h('label', { for: id }, t(`exim.field.${field}`)), select);
      })]);
    };
    entity.addEventListener('change', () => onChange(table.name, { entity: entity.value, mapping: {} }));
    draw(table.entity, table.mapping);
    return h('details', { class: 'exim-map', open: n === 0 },
      h('summary', {}, t('exim.import.mapping', { name: table.name })),
      h('div', { class: 'exim-map-entity' }, h('label', { for: `exim-map-${n}-entity` }, t('exim.import.entity')), entity),
      fields);
  });
}

function total(document) {
  try {
    return formatAmount(computeTotals(document).payable, document.currency);
  } catch {
    return '';
  }
}

function partner(document) {
  const p = (/^RECEIVED|EXPENSE/.test(document.kind) ? document.seller : document.buyer) || {};
  return p.name || '';
}

/** What the plan would do. */
export function planSummary(plan) {
  const r = plan.report;
  const counts = h('ul', { class: 'exim-counts', id: 'exim-import-counts' },
    h('li', {}, t('exim.import.addContacts', { n: r.added.contacts })),
    h('li', {}, t('exim.import.linkContacts', { n: r.linked.contacts })),
    h('li', {}, t('exim.import.addItems', { n: r.added.items })),
    h('li', {}, t('exim.import.addDocuments', { n: r.added.documents })),
    h('li', {}, t('exim.import.skippedCount', { n: r.skipped.length })));
  const docs = plan.documents.slice(0, SAMPLE);
  const table = docs.length ? h('div', { class: 'exim-table-wrap' }, h('table', { class: 'exim-table' },
    h('caption', { class: 'visually-hidden' }, t('exim.import.sample')),
    h('thead', {}, h('tr', {}, [t('exim.column.number'), t('exim.column.kind'), t('exim.column.issueDate'), t('exim.column.partner'), t('exim.column.payable')].map(x => h('th', { scope: 'col' }, x)))),
    h('tbody', {}, docs.map(({ draft }) => h('tr', {},
      h('td', {}, draft.number || ''), h('td', {}, t(`document.kind.${draft.kind}`)), h('td', {}, draft.issueDate ? formatDate(draft.issueDate) : ''),
      h('td', {}, partner(draft)), h('td', { class: 'num' }, total(draft))))))) : null;
  const more = plan.documents.length > SAMPLE ? h('p', { class: 'muted small' }, t('exim.import.more', { n: plan.documents.length - SAMPLE })) : null;
  const issues = [...r.skipped.map(s => ({ ...s, kind: 'skip' })), ...r.warnings.map(w => ({ ...w, reason: w.code, kind: 'warn' }))];
  const list = issues.length ? h('details', { class: 'exim-issues', open: issues.length <= 10 },
    h('summary', {}, t('exim.import.issues', { n: issues.length })),
    h('ul', {}, issues.map(i => h('li', { class: i.kind === 'skip' ? 'exim-skip' : 'exim-warn' },
      `${t(`exim.entity.${i.entity}`)} ${i.ref}: ${reasonText(i.reason)}`)))) : null;
  return h('div', { class: 'exim-plan' }, counts, table, more, list);
}
