// Display helpers of the reports: amounts in EUR, the change against last
// year with its sign, period keys as people read them ("mar 26",
// "Q1 2026"), and the small summary cards above a report.
import { h } from '../../ui/dom.js';
import { t, currentLang } from '../../i18n/index.js';
import { localeOf } from '../../i18n/languages.js';
import { formatAmount, formatNumber } from '../../components/decimal.js';

export const eur = (amount) => formatAmount(amount || '0', 'EUR');

/** Compact axis label: 12 k, 1,2 mil. */
export function compact(value) {
  return formatNumber(String(value), currentLang(), { notation: 'compact', maximumFractionDigits: 1 });
}

/** "+12,5 %" / "-3 %" / "" (no comparison). */
export function changeText(change) {
  if (change === null || change === undefined) return '';
  const number = formatNumber(change, currentLang(), { maximumFractionDigits: 1, signDisplay: 'exceptZero' });
  return t('reports.changePct', { value: number });
}

export function periodLabel(key) {
  if (/^\d{4}-Q[1-4]$/.test(key)) return t('reports.quarterLabel', { quarter: key.slice(6), year: key.slice(0, 4) });
  if (/^\d{4}-\d{2}$/.test(key)) {
    const [y, m] = key.split('-').map(Number);
    return new Intl.DateTimeFormat(localeOf(currentLang()), { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
  }
  return key;
}

/** A row of summary cards: [{ label, value, note?, tone? }]. */
export function summaryCards(cards) {
  return h('div', { class: 'report-cards' }, cards.map(c => h('div', { class: `report-card ${c.tone ? `tone-${c.tone}` : ''}`.trim() },
    h('span', { class: 'report-card-label muted' }, c.label),
    h('strong', { class: 'report-card-value num' }, c.value),
    c.note ? h('span', { class: 'report-card-note muted' }, c.note) : null)));
}
