// The filter bar of document lists: period, status, contact, label and
// currency, plus saved filters. The bar owns the values and reports every
// change through onChange(filter); the list decides what to do with it.
// Saved filters are device preferences, kept under a key per list.
import { h, icon, selectEl } from '../ui/dom.js';
import { t } from '../i18n/index.js';
import { getPrefs, setPref } from '../prefs.js';
import { PERIOD_PRESETS, periodRange } from './dates.js';
import { dateField, textField } from './fields.js';
import { showToast } from '../ui/toast.js';

export const EMPTY_FILTER = Object.freeze({ preset: 'thisYear', from: null, to: null, status: '', contact: '', label: '', currency: '' });

export function savedFilters(key) {
  const all = getPrefs().savedFilters || {};
  return Array.isArray(all[key]) ? all[key] : [];
}

export function saveFilter(key, name, filter) {
  const all = { ...(getPrefs().savedFilters || {}) };
  const list = savedFilters(key).filter(f => f.name !== name);
  all[key] = [...list, { name, filter: { ...filter } }];
  setPref('savedFilters', all);
  return all[key];
}

export function deleteSavedFilter(key, name) {
  const all = { ...(getPrefs().savedFilters || {}) };
  all[key] = savedFilters(key).filter(f => f.name !== name);
  setPref('savedFilters', all);
  return all[key];
}

// A filter with its period bounds resolved from the preset.
export function resolveFilter(filter, today = undefined) {
  if (filter.preset && filter.preset !== 'custom') return { ...filter, ...periodRange(filter.preset, today) };
  return { ...filter };
}

export function createFilterBar({ key, statuses = [], currencies = ['EUR'], value = EMPTY_FILTER, onChange }) {
  let filter = { ...EMPTY_FILTER, ...value };
  const emitChange = () => onChange(resolveFilter(filter));

  const preset = selectEl([...PERIOD_PRESETS, 'custom'].map(p => ({ value: p, label: t(`filter.period.${p}`) })), filter.preset, { 'aria-label': t('filter.period'), class: 'filter-preset' });
  const from = dateField({ label: t('filter.from'), value: filter.from || '' });
  const to = dateField({ label: t('filter.to'), value: filter.to || '' });
  const custom = h('div', { class: 'filter-custom', hidden: filter.preset !== 'custom' }, from.el, to.el);
  preset.addEventListener('change', () => {
    filter.preset = preset.value;
    custom.hidden = preset.value !== 'custom';
    if (preset.value !== 'custom') { filter.from = null; filter.to = null; }
    emitChange();
  });
  [from, to].forEach((f, i) => f.input.addEventListener('change', () => { filter[i ? 'to' : 'from'] = f.value(); emitChange(); }));

  const status = selectEl([{ value: '', label: t('filter.anyStatus') }, ...statuses.map(s => ({ value: s, label: t(`status.${s}`) }))], filter.status, { 'aria-label': t('filter.status') });
  status.addEventListener('change', () => { filter.status = status.value; emitChange(); });
  const contact = textField({ label: null, value: filter.contact, placeholder: t('filter.contact'), attrs: { 'aria-label': t('filter.contact') } });
  const label = textField({ label: null, value: filter.label, placeholder: t('filter.label'), attrs: { 'aria-label': t('filter.label') } });
  [[contact, 'contact'], [label, 'label']].forEach(([f, name]) => {
    let timer = null;
    f.input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { filter[name] = f.value(); emitChange(); }, 150); });
  });
  const currency = selectEl([{ value: '', label: t('filter.anyCurrency') }, ...currencies.map(c => ({ value: c, label: c }))], filter.currency, { 'aria-label': t('filter.currency') });
  currency.addEventListener('change', () => { filter.currency = currency.value; emitChange(); });

  const saved = selectEl([], '', { 'aria-label': t('filter.saved'), class: 'filter-saved' });
  const refreshSaved = () => {
    while (saved.firstChild) saved.removeChild(saved.firstChild);
    saved.append(h('option', { value: '' }, t('filter.savedNone')));
    savedFilters(key).forEach(s => saved.append(h('option', { value: s.name }, s.name)));
  };
  refreshSaved();
  saved.addEventListener('change', () => {
    const hit = savedFilters(key).find(s => s.name === saved.value);
    if (!hit) return;
    filter = { ...EMPTY_FILTER, ...hit.filter };
    preset.value = filter.preset; status.value = filter.status; contact.input.value = filter.contact;
    label.input.value = filter.label; currency.value = filter.currency;
    from.input.value = filter.from || ''; to.input.value = filter.to || '';
    custom.hidden = filter.preset !== 'custom';
    emitChange();
  });
  const saveBtn = h('button', {
    type: 'button', class: 'btn btn-ghost', onclick: () => {
      const name = window.prompt(t('filter.saveName'));
      if (!name || !name.trim()) return;
      saveFilter(key, name.trim(), filter);
      refreshSaved();
      saved.value = name.trim();
      showToast(t('filter.savedToast', { name: name.trim() }), { type: 'success' });
    }
  }, icon('bookmark'), t('filter.save'));
  const reset = h('button', {
    type: 'button', class: 'btn btn-ghost', onclick: () => {
      filter = { ...EMPTY_FILTER };
      preset.value = filter.preset; status.value = ''; contact.input.value = ''; label.input.value = ''; currency.value = '';
      from.input.value = ''; to.input.value = ''; custom.hidden = true; saved.value = '';
      emitChange();
    }
  }, icon('x'), t('filter.reset'));

  const el = h('div', { class: 'filter-bar', role: 'search', 'aria-label': t('filter.title') },
    h('div', { class: 'filter-row' }, preset, status, contact.el, label.el, currency, saved, saveBtn, reset),
    custom);
  return { el, value: () => resolveFilter(filter) };
}
