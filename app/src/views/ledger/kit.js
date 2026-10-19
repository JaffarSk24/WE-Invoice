// Shared pieces of the ledger screens: the header with the year picker,
// money formatting, the explanation shown when the company keeps no
// books here (NONE or EXTERNAL), the refusal of writes in demo mode and a
// view that redraws itself on data changes while it is on the page.
import { h, icon } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { on } from '../../events.js';
import { navigate } from '../../router.js';
import { showToast } from '../../ui/toast.js';
import { formatAmount } from '../../components/decimal.js';
import { emptyState } from '../../components/empty-state.js';
import { getPrefs, setPref } from '../../prefs.js';
import { isDemo } from '../shell/demo-mode.js';
import { todayLocal } from '../../components/dates.js';
import { ledgerMode, ledgerCompany, isReadOnly, BOOKKEEPING_MODES } from './state.js';

export const money = (amount) => (amount === null || amount === undefined || amount === '' ? '' : formatAmount(amount, 'EUR'));

/** The year the ledger screens show (kept on the device). */
export function ledgerYear() {
  const saved = Number(getPrefs().ledgerYear);
  return Number.isInteger(saved) && saved > 1900 ? saved : Number(todayLocal().slice(0, 4));
}

export function setLedgerYear(year) {
  setPref('ledgerYear', Number(year));
}

export function viewHeader({ title, years = null, year = null, onYear = null, actions = [] }) {
  const picker = years ? h('select', {
    class: 'ledger-year', 'aria-label': t('ledger.year'),
    onchange: (e) => { setLedgerYear(e.target.value); if (onYear) onYear(Number(e.target.value)); }
  }, years.map(y => h('option', { value: String(y), selected: y === year }, String(y)))) : null;
  const header = h('header', { class: 'view-header ledger-header' },
    h('h1', {}, title),
    h('div', { class: 'view-actions' }, picker, actions.map(a => h('button', {
      type: 'button', class: `btn ${a.primary ? 'btn-primary' : ''}`.trim(), onclick: a.onClick, 'aria-label': a.label, title: a.label, disabled: a.disabled || false, dataset: a.id ? { action: a.id } : null
    }, a.icon ? icon(a.icon) : null, h('span', { class: 'btn-label' }, a.label)))));
  refreshIcons(header);
  return header;
}

/**
 * The screen of a company without books in the app: an explanation and
 * the way to change the mode. Returns null when the screen can render.
 */
export function modeNotice() {
  const company = ledgerCompany();
  if (!company) {
    return emptyState({ title: t('ledger.mode.noCompany.title'), text: t('ledger.mode.noCompany.text'), iconName: 'building-2', actionLabel: t('ledger.mode.noCompany.action'), onAction: () => navigate('onboarding'), actionIcon: 'plus' });
  }
  const mode = ledgerMode(company);
  if (BOOKKEEPING_MODES.includes(mode)) return null;
  const key = mode === 'EXTERNAL' ? 'external' : 'none';
  return emptyState({
    title: t(`ledger.mode.${key}.title`), text: t(`ledger.mode.${key}.text`), iconName: mode === 'EXTERNAL' ? 'archive' : 'notebook-pen',
    actionLabel: t(`ledger.mode.${key}.action`), onAction: () => navigate('settings'), actionIcon: 'settings'
  });
}

/** True when a write may go ahead; otherwise tells the user why not. */
export function canWrite() {
  if (isDemo()) { showToast(t('ledger.demo.readOnly'), { type: 'info' }); return false; }
  if (isReadOnly()) { showToast(t('ledger.readOnly'), { type: 'error' }); return false; }
  return true;
}

/** Draws now and again on every data change while root is on the page. */
export function liveView(root, draw) {
  const events = ['data:changed', 'company:switched', 'demo:enabled', 'demo:disabled', 'language:changed'];
  let offs = [];
  const redraw = () => {
    if (!root.isConnected) { offs.forEach(off => off()); offs = []; return; }
    draw();
  };
  draw();
  offs = events.map(ev => on(ev, redraw));
}

/** A row of figures: [{label, value, tone?}] */
export function stats(items) {
  return h('div', { class: 'stats ledger-stats' }, items.map(i => h('div', { class: `stat ${i.tone ? `stat-${i.tone}` : ''}`.trim() },
    h('div', { class: 'stat-label' }, i.label), h('div', { class: 'stat-value num' }, i.value))));
}

export function callout(kind, text) {
  return h('div', { class: kind === 'info' ? 'callout' : `callout callout-${kind}`, role: kind === 'danger' ? 'alert' : 'status' }, text);
}
