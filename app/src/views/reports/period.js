// The period bar of the reports: a preset (this month, this year...) or
// custom dates, the step of the charts (month, quarter, year) and the
// label and project filters. The choice is a device preference, so the
// reports open on the period last looked at.
import { h, selectEl } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { getPrefs, setPref } from '../../prefs.js';
import { PERIOD_PRESETS, periodRange, todayLocal } from '../../components/dates.js';
import { dateField } from '../../components/fields.js';

export const DEFAULT_PERIOD = Object.freeze({ preset: 'thisYear', from: null, to: null, granularity: 'month', label: '', project: '' });
const GRANULARITY_KEYS = ['month', 'quarter', 'year'];

export function loadPeriod() {
  const saved = getPrefs().reportsPeriod;
  return { ...DEFAULT_PERIOD, ...(saved && typeof saved === 'object' ? saved : {}) };
}

/** The period with its bounds resolved; "all" spans every record. */
export function resolvePeriod(period, today = todayLocal()) {
  if (period.preset === 'custom') return { ...period, from: period.from || null, to: period.to || null };
  return { ...period, ...periodRange(period.preset, today) };
}

export function createPeriodBar({ value, labels = [], projects = [], onChange }) {
  let period = { ...DEFAULT_PERIOD, ...value };
  const changed = () => { setPref('reportsPeriod', period); onChange(resolvePeriod(period)); };

  const preset = selectEl([...PERIOD_PRESETS, 'custom'].map(p => ({ value: p, label: t(`filter.period.${p}`) })), period.preset, { 'aria-label': t('filter.period'), class: 'report-preset' });
  const from = dateField({ label: t('filter.from'), value: period.from || '' });
  const to = dateField({ label: t('filter.to'), value: period.to || '' });
  const custom = h('div', { class: 'filter-custom', hidden: period.preset !== 'custom' }, from.el, to.el);
  preset.addEventListener('change', () => {
    period = { ...period, preset: preset.value };
    custom.hidden = preset.value !== 'custom';
    changed();
  });
  [from, to].forEach((f, i) => f.input.addEventListener('change', () => { period = { ...period, [i ? 'to' : 'from']: f.value() }; changed(); }));
  const step = selectEl(GRANULARITY_KEYS.map(g => ({ value: g, label: t(`reports.granularity.${g}`) })), period.granularity, { 'aria-label': t('reports.granularity'), class: 'report-step' });
  step.addEventListener('change', () => { period = { ...period, granularity: step.value }; changed(); });
  const label = selectEl([{ value: '', label: t('reports.anyLabel') }, ...labels.map(l => ({ value: l.value, label: `${l.value} (${l.count})` }))], period.label, { 'aria-label': t('filter.label'), class: 'report-label' });
  label.addEventListener('change', () => { period = { ...period, label: label.value }; changed(); });
  const project = selectEl([{ value: '', label: t('reports.anyProject') }, ...projects.map(p => ({ value: p.value, label: `${p.value} (${p.count})` }))], period.project, { 'aria-label': t('reports.project'), class: 'report-project' });
  project.addEventListener('change', () => { period = { ...period, project: project.value }; changed(); });

  const el = h('div', { class: 'filter-bar report-bar', role: 'search', 'aria-label': t('reports.periodBar') },
    h('div', { class: 'filter-row' }, preset, step, labels.length ? label : null, projects.length ? project : null),
    custom);
  return { el, value: () => resolvePeriod(period) };
}
