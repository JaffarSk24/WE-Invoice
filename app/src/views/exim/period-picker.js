// The period of an export: the presets of the filter bar (the default is
// last month, what an accountant asks for) or two dates of one's own.
import { h, selectEl } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { periodRange, todayLocal } from '../../components/dates.js';

const PRESETS = ['lastMonth', 'thisMonth', 'thisQuarter', 'thisYear', 'lastYear', 'custom'];

export function resolvePeriod(state, today = todayLocal()) {
  if (state.preset === 'custom') return { from: state.from || null, to: state.to || null };
  return periodRange(state.preset, today);
}

/** @returns {{el: HTMLElement, value: () => {from, to}}} */
export function periodPicker(state, onChange, idPrefix = 'exim') {
  const select = selectEl(PRESETS.map(p => ({ value: p, label: t(`filter.period.${p}`) })), state.preset, { id: `${idPrefix}-period`, 'aria-label': t('filter.period') });
  const range = resolvePeriod(state);
  const from = h('input', { type: 'date', id: `${idPrefix}-from`, value: range.from || '', 'aria-label': t('filter.from') });
  const to = h('input', { type: 'date', id: `${idPrefix}-to`, value: range.to || '', 'aria-label': t('filter.to') });
  const dates = h('div', { class: 'exim-dates', hidden: state.preset !== 'custom' }, from, h('span', { 'aria-hidden': 'true' }, '-'), to);
  select.addEventListener('change', () => {
    state.preset = select.value;
    const r = resolvePeriod(state);
    if (state.preset !== 'custom') {
      from.value = r.from || '';
      to.value = r.to || '';
    } else {
      state.from = from.value;
      state.to = to.value;
    }
    dates.hidden = state.preset !== 'custom';
    onChange();
  });
  [from, to].forEach(input => input.addEventListener('change', () => {
    state.preset = 'custom';
    select.value = 'custom';
    state.from = from.value;
    state.to = to.value;
    dates.hidden = false;
    onChange();
  }));
  const el = h('div', { class: 'exim-period' }, h('label', { for: `${idPrefix}-period`, class: 'exim-label' }, t('filter.period')), select, dates);
  return { el, value: () => resolvePeriod(state) };
}
