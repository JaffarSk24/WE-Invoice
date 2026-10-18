// The tax calendar of the dashboard: the next filing dates for the
// company's VAT mode and period, from the deadlines in the legislation
// file (never from code). Income tax dates are shown as soon as the
// legislation file carries them (incomeTaxReturnMonth/Day, advanceDay);
// until then only the VAT dates are known.
import { LEGISLATION } from '@we-invoice/core';
import { ymd, daysInMonth, daysBetween } from '../../components/dates.js';

// The entry of a legislation list valid on a date.
export function validEntry(list, date) {
  return (list || []).find(e => e.validFrom <= date && (!e.validTo || e.validTo >= date)) || null;
}

export function deadlinesFor(date, country = 'SK') {
  const data = LEGISLATION[country];
  return data ? validEntry(data.deadlines, date) : null;
}

export function vatThresholdFor(date, country = 'SK') {
  const data = LEGISLATION[country];
  const entry = data ? validEntry(data.vatRegistrationThreshold, date) : null;
  return entry ? entry.amount : null;
}

// The last day of the period ending before `date` and the first day after it.
function periodEnds(today, months) {
  const [y, m] = today.split('-').map(Number);
  const ends = [];
  for (let k = -1; k <= 12; k++) {
    const idx = Math.floor((m - 1) / months) * months + k * months + months;
    const total = idx - 1;
    const yy = y + Math.floor(total / 12);
    const mm = ((total % 12) + 12) % 12 + 1;
    ends.push({ y: yy, m: mm, label: months === 1 ? `${yy}-${String(mm).padStart(2, '0')}` : `Q${Math.ceil(mm / 3)} ${yy}` });
  }
  return ends;
}

function dueAfter(end, day) {
  let y = end.y;
  let m = end.m + 1;
  if (m > 12) { m = 1; y += 1; }
  return ymd(y, m, Math.min(day, daysInMonth(y, m)));
}

// Upcoming events: [{ id, period, due, daysLeft }], soonest first.
export function taxCalendar({ company, today, limit = 6 }) {
  const deadlines = deadlinesFor(today);
  if (!deadlines) return [];
  const vatMode = company ? company.vatMode : 'PAYER';
  const months = company && company.vatPeriod === 'QUARTER' ? 3 : 1;
  const events = [];
  const push = (id, period, due) => { if (due >= today) events.push({ id, period, due, daysLeft: daysBetween(today, due) }); };
  if (vatMode === 'PAYER') {
    periodEnds(today, months).forEach(end => {
      push('vatReturn', end.label, dueAfter(end, deadlines.vatReturnDay));
      push('kv', end.label, dueAfter(end, deadlines.kvDay));
    });
    periodEnds(today, 3).forEach(end => push('sv', end.label, dueAfter(end, deadlines.svDay)));
  } else if (vatMode === 'REGISTERED_7') {
    periodEnds(today, 1).forEach(end => push('vatReturn', end.label, dueAfter(end, deadlines.vatReturnDay)));
  }
  if (deadlines.incomeTaxReturnMonth && deadlines.incomeTaxReturnDay) {
    const year = Number(today.slice(0, 4));
    [year, year + 1].forEach(y => push(company && company.taxpayerType === 'PO' ? 'dppo' : 'dpfo', String(y - 1), ymd(y, deadlines.incomeTaxReturnMonth, deadlines.incomeTaxReturnDay)));
  }
  if (deadlines.advanceDay) {
    periodEnds(today, 3).forEach(end => push('advance', end.label, ymd(end.y, end.m, Math.min(deadlines.advanceDay, daysInMonth(end.y, end.m)))));
  }
  const seen = new Set();
  return events
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.id.localeCompare(b.id)))
    .filter(e => { const k = `${e.id}:${e.due}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, limit);
}
