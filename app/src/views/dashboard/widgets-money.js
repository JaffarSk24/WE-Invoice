// Dashboard widgets about money: issued this month and year, unpaid by
// age, top clients and debtors, the sales and purchase balance, account
// balances. Each takes the data and draws; the numbers come from
// metrics.js.
import { h } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { formatAmount, cmp } from '../../components/decimal.js';
import { issuedSummary, unpaidSummary, topClients, topDebtors, balanceSummary, AGE_BUCKETS } from './metrics.js';

const money = (v, currency = 'EUR') => formatAmount(v, currency);

function stat(label, value, hint = null) {
  return h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, label), h('span', { class: 'stat-value num' }, value), hint ? h('span', { class: 'stat-hint' }, hint) : null);
}

function change(current, previous) {
  if (cmp(previous, '0') === 0) return null;
  const pct = Math.round(((Number(current) - Number(previous)) / Number(previous)) * 100);
  return h('span', { class: `stat-change ${pct >= 0 ? 'is-up' : 'is-down'}` }, `${pct >= 0 ? '+' : ''}${pct} %`);
}

export function issuedWidget({ documents, today }) {
  const s = issuedSummary(documents, today);
  return h('div', { class: 'stats' },
    stat(t('dashboard.issued.month'), money(s.month.gross), t('dashboard.issued.net', { amount: money(s.month.net) })),
    stat(t('dashboard.issued.year'), money(s.year.gross), t('dashboard.issued.net', { amount: money(s.year.net) })),
    h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, t('dashboard.issued.lastYear')), h('span', { class: 'stat-value num' }, money(s.lastYear.gross)), change(s.year.gross, s.lastYear.gross)));
}

export function unpaidWidget({ documents, today, navigate }) {
  const s = unpaidSummary(documents, today);
  const list = h('ul', { class: 'aging' }, AGE_BUCKETS.map(b => h('li', { class: `aging-row ${b === 'd60plus' ? 'is-worst' : ''}` },
    h('span', {}, t(`dashboard.unpaid.${b}`)),
    h('span', { class: 'num' }, s.buckets[b].count ? `${s.buckets[b].count} / ${money(s.buckets[b].amount)}` : t('dashboard.none')))));
  return h('div', {},
    h('div', { class: 'stats' }, stat(t('dashboard.unpaid.open'), money(s.total), t('dashboard.unpaid.count', { n: s.count })), stat(t('dashboard.unpaid.overdue'), money(s.overdue))),
    list,
    h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => navigate('invoices') }, t('dashboard.unpaid.open.all')));
}

function rankList(items, empty) {
  if (!items.length) return h('p', { class: 'muted' }, empty);
  return h('ol', { class: 'rank' }, items.map(i => h('li', {}, h('span', { class: 'rank-name' }, i.name), h('span', { class: 'num' }, money(i.amount)))));
}

export function topClientsWidget({ documents, today }) {
  return rankList(topClients(documents, today.slice(0, 4)), t('dashboard.topClients.empty'));
}

export function topDebtorsWidget({ documents, today }) {
  return rankList(topDebtors(documents, today), t('dashboard.topDebtors.empty'));
}

export function balanceWidget({ documents, today }) {
  const s = balanceSummary(documents, today.slice(0, 4));
  return h('div', { class: 'stats' },
    stat(t('dashboard.balance.sales'), money(s.sales)),
    stat(t('dashboard.balance.purchases'), money(s.purchases)),
    stat(t('dashboard.balance.result'), money(s.balance)));
}

export function accountsWidget({ accounts }) {
  if (!accounts || !accounts.length) return h('p', { class: 'muted' }, t('dashboard.accounts.empty'));
  return h('ul', { class: 'rank' }, accounts.map(a => h('li', {}, h('span', { class: 'rank-name' }, a.name), h('span', { class: 'num' }, money(a.balance, a.currency || 'EUR')))));
}
