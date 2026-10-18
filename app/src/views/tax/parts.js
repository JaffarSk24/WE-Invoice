// Building blocks shared by the tax screens: the period switcher, the
// kind of filing, the disclaimer, the summary tiles, the list of problems
// with links to the documents and the status of a filed report. Text only
// through i18n keys of the tax part.
import { h, icon, selectEl } from '../../ui/dom.js';
import { t, currentLang } from '../../i18n/index.js';
import { parseTaxPeriod, previousTaxPeriod, nextTaxPeriod } from '@we-invoice/core';
import { formatAmount } from '../../components/decimal.js';
import { formatDateTime } from '../../components/dates.js';
import { documentHref } from './data.js';

// The name of a period in the interface language: a month and year, or a
// quarter and year.
export function periodLabel(period) {
  const p = parseTaxPeriod(period);
  if (p.kind === 'QUARTER') return t('tax.period.quarter', { quarter: p.quarter, year: p.year });
  const name = new Intl.DateTimeFormat(currentLang() || 'sk', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(p.year, p.month - 1, 1)));
  return t('tax.period.month', { month: name, year: p.year });
}

export function periodBar(period, onChange) {
  return h('div', { class: 'tax-period', role: 'group', 'aria-label': t('tax.period.label') },
    h('button', { type: 'button', class: 'btn btn-ghost btn-icon', 'aria-label': t('tax.period.previous'), onclick: () => onChange(previousTaxPeriod(period)) }, icon('chevron-left')),
    h('span', { class: 'tax-period-name', 'aria-live': 'polite' }, periodLabel(period)),
    h('button', { type: 'button', class: 'btn btn-ghost btn-icon', 'aria-label': t('tax.period.next'), onclick: () => onChange(nextTaxPeriod(period)) }, icon('chevron-right')));
}

export function filingTypeSelect(types, value, onChange) {
  const select = selectEl(types.map(type => ({ value: type, label: t(`tax.filingType.${type}`) })), value, { 'aria-label': t('tax.filingType.label'), class: 'tax-filing-type' });
  select.addEventListener('change', () => onChange(select.value));
  return h('label', { class: 'tax-field' }, h('span', { class: 'tax-field-label' }, t('tax.filingType.label')), select);
}

export function disclaimer() {
  return h('p', { class: 'callout callout-info tax-disclaimer', role: 'note' }, icon('info'), h('span', {}, t('tax.disclaimer')));
}

/** A callout when the form layout is not yet confirmed against the official XSD. */
export function unverifiedNote(form) {
  if (!form || form.verified) return null;
  return h('p', { class: 'callout callout-warning', role: 'note' }, icon('triangle-alert'), h('span', {}, t('tax.form.unverified', { form: form.name })));
}

export function money(amount) {
  return formatAmount(amount || '0', 'EUR');
}

/** Tiles: [{ label, amount, tone? }] */
export function summaryTiles(items) {
  return h('div', { class: 'tax-summary' }, items.map(item => h('div', { class: `tax-tile ${item.tone ? `is-${item.tone}` : ''}`.trim() },
    h('span', { class: 'tax-tile-label' }, item.label),
    h('span', { class: 'tax-tile-value num' }, item.text !== undefined ? item.text : money(item.amount)))));
}

// A code without its own text (an error of the totals, for example) is
// shown through the general error text of the code.
function problemText(p) {
  const params = { number: p.number || t('tax.problem.noNumber'), ...p.params };
  const key = `tax.problem.${p.code}`;
  const text = t(key, params);
  return text === key ? t('tax.problem.generic', { ...params, message: t(`errors.${p.code}`) }) : text;
}

/** Problems with links to the documents, errors first. */
export function problemList(problems) {
  if (!problems.length) {
    return h('p', { class: 'callout callout-success tax-checks-ok' }, icon('circle-check'), h('span', {}, t('tax.checks.ok')));
  }
  const errors = problems.filter(p => p.severity === 'error').length;
  return h('section', { class: 'tax-problems', 'aria-labelledby': 'tax-problems-title' },
    h('h2', { id: 'tax-problems-title' }, t('tax.checks.title', { errors, warnings: problems.length - errors })),
    h('ul', { class: 'tax-problem-list' }, problems.map(p => {
      const href = documentHref(p.kind, p.docId);
      return h('li', { class: `tax-problem is-${p.severity}` },
        icon(p.severity === 'error' ? 'circle-x' : 'triangle-alert'),
        h('span', { class: 'tax-problem-text' }, problemText(p)),
        href ? h('a', { href, class: 'tax-problem-link' }, t('tax.checks.open')) : null);
    })));
}

/** One line about the last filing of the report. */
export function filingLine(status) {
  if (!status.filed) return h('p', { class: 'muted tax-filing' }, t('tax.filing.none'));
  const at = formatDateTime(status.lastFiled.at);
  return h('p', { class: `tax-filing ${status.changedSinceFiling ? 'callout callout-warning' : 'muted'}` },
    status.changedSinceFiling ? icon('triangle-alert') : icon('circle-check'),
    h('span', {}, t(status.changedSinceFiling ? 'tax.filing.changed' : 'tax.filing.done', { at, type: t(`tax.filingType.${status.lastFiled.type}`) })));
}

/** A simple table: columns [{ label, value(row), num? }]. */
export function simpleTable(columns, rows, { caption = null, foot = null } = {}) {
  return h('div', { class: 'table-scroll tax-table-wrap' },
    h('table', { class: 'tax-table' },
      caption ? h('caption', {}, caption) : null,
      h('thead', {}, h('tr', {}, columns.map(c => h('th', { scope: 'col', class: c.num ? 'num' : null }, c.label)))),
      h('tbody', {}, rows.map(row => h('tr', {}, columns.map(c => h('td', { class: c.num ? 'num' : null }, c.value(row)))))),
      foot ? h('tfoot', {}, h('tr', {}, columns.map((c, i) => h('td', { class: c.num ? 'num' : null }, foot[i] ?? '')))) : null));
}

export function documentLink(kind, id, text) {
  const href = documentHref(kind, id);
  return href ? h('a', { href }, text || t('tax.problem.noNumber')) : (text || '');
}
