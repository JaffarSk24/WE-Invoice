// The calendar of a recurring invoice (03-features.md § 3.6.3), as pure
// functions on calendar dates (YYYY-MM-DD, no time zone; "today" is the
// local date in Europe/Bratislava and comes from the caller).
//
// Run n (0, 1, 2...) is counted from the first run, never from the
// previous one, so a template started on the 31st runs on 28 or 29
// February and again on 31 March instead of drifting to the 28th. Each run
// covers a period: for monthly kinds the calendar months from the month
// of the run up to the month before the next run, for weekly ones the
// days up to the next run. templateId + periodStart identifies the
// document of a run, which keeps generation idempotent.

export const MONTHS_OF = Object.freeze({ MONTH: 1, QUARTER: 3, HALF_YEAR: 6, YEAR: 12 });
// Missed runs made at once at most (the app was closed for a long time).
export const MAX_CATCH_UP = 24;
const MAX_RUNS = 5000;

const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const parts = (date) => date.split('-').map(Number);

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(date, days) {
  const [y, m, d] = parts(date);
  const r = new Date(Date.UTC(y, m - 1, d + days));
  return ymd(r.getUTCFullYear(), r.getUTCMonth() + 1, r.getUTCDate());
}

// Months later, the day kept or cut to the end of a shorter month.
export function addMonths(date, months, anchorDay = parts(date)[2]) {
  const [y, m] = parts(date);
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return ymd(year, month, Math.min(anchorDay, daysInMonth(year, month)));
}

function step(template) {
  const interval = Math.max(1, Number(template.interval) || 1);
  if (template.frequency === 'WEEK') return { days: 7 * interval };
  if (template.frequency === 'MONTHS') return { months: interval };
  return { months: (MONTHS_OF[template.frequency] || 1) };
}

// The date of run n.
export function runDate(template, n) {
  const s = step(template);
  if (s.days) return addDays(template.firstRun, s.days * n);
  return addMonths(template.firstRun, s.months * n, parts(template.firstRun)[2]);
}

// The period a run covers: { start, end } inclusive.
export function periodOf(template, n) {
  const s = step(template);
  const date = runDate(template, n);
  if (s.days) return { start: date, end: addDays(runDate(template, n + 1), -1) };
  const [y, m] = parts(date);
  const start = ymd(y, m, 1);
  const end = addDays(addMonths(start, s.months, 1), -1);
  return { start, end };
}

// True while run n is allowed by the end date and the number of runs.
export function withinLimits(template, n) {
  if (template.maxCount && n >= template.maxCount) return false;
  if (template.endDate && runDate(template, n) > template.endDate) return false;
  return true;
}

// The index of the first run on or after a date.
export function runIndexFrom(template, date) {
  for (let n = 0; n < MAX_RUNS; n++) if (runDate(template, n) >= date) return n;
  return MAX_RUNS;
}

/**
 * The runs to make today: from the stored next run up to today, within
 * the end date and count, at most MAX_CATCH_UP. A paused template makes
 * none.
 * @returns {Array<{n: number, date: string, period: {start: string, end: string}}>}
 */
export function dueRuns(template, today) {
  if (!template || template.active === false || !template.firstRun) return [];
  const from = template.nextRun && template.nextRun > template.firstRun ? template.nextRun : template.firstRun;
  const runs = [];
  for (let n = runIndexFrom(template, from); n < MAX_RUNS && runs.length < MAX_CATCH_UP; n++) {
    const date = runDate(template, n);
    if (date > today || !withinLimits(template, n)) break;
    runs.push({ n, date, period: periodOf(template, n) });
  }
  return runs;
}

// The next run after a run, or null when the schedule has ended.
export function nextRunAfter(template, n) {
  return withinLimits(template, n + 1) ? runDate(template, n + 1) : null;
}

// The next runs from a date, for the preview in the form.
export function upcomingRuns(template, fromDate, count = 3) {
  const out = [];
  for (let n = runIndexFrom(template, fromDate); out.length < count && n < MAX_RUNS; n++) {
    if (!withinLimits(template, n)) break;
    out.push({ n, date: runDate(template, n), period: periodOf(template, n) });
  }
  return out;
}
