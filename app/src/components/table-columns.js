// Which columns a list shows, remembered per list on the device, and the
// dialog that changes them. Pure helpers first, the dialog last.
import { h } from '../ui/dom.js';
import { openModal } from '../ui/modal.js';
import { t } from '../i18n/index.js';
import { getPrefs, setPref } from '../prefs.js';

// The ids of the visible columns: the saved choice when it is valid,
// otherwise every column not hidden by default. Columns marked `always`
// are never hidden.
export function visibleColumnIds(columns, saved) {
  const ids = columns.map(c => c.id);
  const chosen = Array.isArray(saved) ? saved.filter(id => ids.includes(id)) : null;
  const base = chosen && chosen.length ? chosen : columns.filter(c => !c.hidden).map(c => c.id);
  return ids.filter(id => base.includes(id) || columns.find(c => c.id === id).always);
}

export function loadColumnChoice(key) {
  const all = getPrefs().tableColumns || {};
  return all[key] || null;
}

export function saveColumnChoice(key, ids) {
  const all = { ...(getPrefs().tableColumns || {}) };
  all[key] = ids;
  setPref('tableColumns', all);
  return ids;
}

export function openColumnPicker({ columns, visible, onApply }) {
  const checks = columns.map(c => {
    const input = h('input', { type: 'checkbox', checked: visible.includes(c.id), disabled: Boolean(c.always), id: `col-${c.id}` });
    return { column: c, input, el: h('label', { class: 'checkbox-label column-choice', for: `col-${c.id}` }, input, h('span', {}, c.label)) };
  });
  openModal({
    title: t('table.columns'),
    body: h('div', { class: 'column-picker' }, checks.map(c => c.el)),
    actions: [
      { label: t('common.cancel'), onClick: (m) => m.close() },
      {
        label: t('common.save'), kind: 'primary',
        onClick: (m) => { onApply(checks.filter(c => c.input.checked || c.column.always).map(c => c.column.id)); m.close(); }
      }
    ]
  });
}
