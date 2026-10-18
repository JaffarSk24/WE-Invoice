// Dashboard widgets that are not sums of money: quick actions, the VAT
// registration limit for non-payers, the tax calendar, incoming
// e-invoices waiting.
import { h, icon } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { formatAmount } from '../../components/decimal.js';
import { formatDate } from '../../components/dates.js';
import { vatThresholdSummary } from './metrics.js';
import { taxCalendar, vatThresholdFor } from './tax-calendar.js';

export const QUICK_ACTIONS = Object.freeze([
  { id: 'invoice', label: 'dashboard.quick.invoice', icon: 'file-plus-2', route: 'invoices', event: 'document:new', payload: { kind: 'INVOICE' }, brand: true },
  { id: 'expense', label: 'dashboard.quick.expense', icon: 'receipt', route: 'expenses', event: 'document:new', payload: { kind: 'EXPENSE_RECEIPT' } },
  { id: 'import', label: 'dashboard.quick.import', icon: 'import', route: 'bank', event: 'bank:import', payload: {} },
  { id: 'receive', label: 'dashboard.quick.receive', icon: 'mail-check', route: 'efaktury-in', event: 'peppol:receive', payload: {} }
]);

export function quickActionsWidget({ navigate, emit }) {
  return h('div', { class: 'quick-actions' }, QUICK_ACTIONS.map(a => h('button', {
    type: 'button', class: `btn ${a.brand ? 'btn-brand' : ''}`.trim(), dataset: { action: a.id },
    onclick: () => { navigate(a.route); emit(a.event, a.payload); }
  }, icon(a.icon), t(a.label))));
}

// Only for non-payers: turnover of the last 12 months against the limit,
// with warnings at 80 % and 100 %.
export function vatThresholdWidget({ documents, today, company }) {
  if (company && company.vatMode === 'PAYER') return h('p', { class: 'muted' }, t('dashboard.vatThreshold.payer'));
  const limit = vatThresholdFor(today);
  if (!limit) return h('p', { class: 'muted' }, t('dashboard.vatThreshold.unknown'));
  const s = vatThresholdSummary(documents, today, limit);
  const width = Math.min(100, s.percent);
  return h('div', { class: `threshold is-${s.level}` },
    h('div', { class: 'threshold-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(width), 'aria-label': t('dashboard.vatThreshold.title') },
      h('div', { class: 'threshold-fill', style: { width: `${width}%` } })),
    h('p', { class: 'threshold-text num' }, t('dashboard.vatThreshold.text', { turnover: formatAmount(s.turnover), limit: formatAmount(s.limit), percent: s.percent })),
    s.level === 'over' ? h('p', { class: 'callout callout-danger' }, icon('triangle-alert'), h('span', {}, t('dashboard.vatThreshold.over'))) : null,
    s.level === 'warn' ? h('p', { class: 'callout callout-warning' }, icon('triangle-alert'), h('span', {}, t('dashboard.vatThreshold.warn'))) : null);
}

export function taxCalendarWidget({ company, today }) {
  const events = taxCalendar({ company, today });
  if (!events.length) return h('p', { class: 'muted' }, t('dashboard.taxCalendar.empty'));
  return h('ul', { class: 'calendar' }, events.map(e => h('li', { class: `calendar-row ${e.daysLeft <= 7 ? 'is-soon' : ''}` },
    h('span', { class: 'calendar-date num' }, formatDate(e.due)),
    h('span', { class: 'calendar-name' }, t(`dashboard.taxCalendar.${e.id}`), ' ', h('span', { class: 'muted' }, e.period)),
    h('span', { class: 'calendar-left num' }, t('dashboard.taxCalendar.daysLeft', { n: e.daysLeft })))));
}

export function efakturyWidget({ inboxCount, navigate }) {
  return h('div', { class: 'stats' },
    h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, t('dashboard.efaktury.waiting')), h('span', { class: 'stat-value num' }, String(inboxCount || 0))),
    h('button', { type: 'button', class: 'btn btn-sm', onclick: () => navigate('efaktury-in') }, icon('mail-check'), t('dashboard.efaktury.open')));
}
