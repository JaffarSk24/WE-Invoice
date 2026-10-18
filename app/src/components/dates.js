// Calendar dates for the interface: "today" is the local date in
// Europe/Bratislava, calendar dates are YYYY-MM-DD strings without a time
// zone, and anything shown to a person is formatted in the user's locale.
import { currentLang } from '../i18n/index.js';
import { localeOf } from '../i18n/languages.js';

export const APP_TIME_ZONE = 'Europe/Bratislava';

// The local calendar date of an instant (default: now).
export function todayLocal(now = new Date(), timeZone = APP_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type) => parts.find(p => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const pad = (n) => String(n).padStart(2, '0');

export function ymd(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(date, days) {
  const [y, m, d] = date.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86400000;
  const r = new Date(t);
  return ymd(r.getUTCFullYear(), r.getUTCMonth() + 1, r.getUTCDate());
}

// Whole days from a to b (negative when b is before a).
export function daysBetween(a, b) {
  const toMs = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((toMs(b) - toMs(a)) / 86400000);
}

export const PERIOD_PRESETS = Object.freeze(['thisMonth', 'lastMonth', 'thisQuarter', 'thisYear', 'lastYear', 'all']);

// { from, to } of a preset around a date; "all" gives null bounds.
export function periodRange(preset, today = todayLocal()) {
  const [y, m] = today.split('-').map(Number);
  switch (preset) {
    case 'thisMonth': return { from: ymd(y, m, 1), to: ymd(y, m, daysInMonth(y, m)) };
    case 'lastMonth': {
      const ly = m === 1 ? y - 1 : y;
      const lm = m === 1 ? 12 : m - 1;
      return { from: ymd(ly, lm, 1), to: ymd(ly, lm, daysInMonth(ly, lm)) };
    }
    case 'thisQuarter': {
      const q0 = Math.floor((m - 1) / 3) * 3 + 1;
      return { from: ymd(y, q0, 1), to: ymd(y, q0 + 2, daysInMonth(y, q0 + 2)) };
    }
    case 'thisYear': return { from: ymd(y, 1, 1), to: ymd(y, 12, 31) };
    case 'lastYear': return { from: ymd(y - 1, 1, 1), to: ymd(y - 1, 12, 31) };
    default: return { from: null, to: null };
  }
}

export function inRange(date, { from, to }) {
  if (!date) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

export function formatDate(date, lang = currentLang()) {
  if (!date) return '';
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(localeOf(lang), { timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatDateTime(iso, lang = currentLang()) {
  if (!iso) return '';
  return new Intl.DateTimeFormat(localeOf(lang), { timeZone: APP_TIME_ZONE, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}
