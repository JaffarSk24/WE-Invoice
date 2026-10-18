// Time helpers. Storage is UTC (ISO strings); "today" and cache expiry at
// midnight follow Europe/Bratislava, the time zone of the users.
export const ZONE = 'Europe/Bratislava';

const dateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const offsetFormat = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, timeZoneName: 'longOffset' });

export const nowIso = () => new Date().toISOString();

// Calendar date (YYYY-MM-DD) of an instant in Bratislava.
export function localDate(date = new Date()) {
  return dateFormat.format(date);
}

// Local date and time in Bratislava as dd.mm.yyyy hh:mm, for people.
const dateTimeParts = new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export function localDateTime(date = new Date()) {
  const p = Object.fromEntries(dateTimeParts.formatToParts(date).map(x => [x.type, x.value]));
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`;
}

// Offset of Bratislava from UTC in minutes at the given instant.
export function zoneOffsetMinutes(date = new Date()) {
  const name = offsetFormat.formatToParts(date).find(p => p.type === 'timeZoneName').value;
  const m = name.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

// Milliseconds until the next local midnight (at least one minute).
export function untilLocalMidnight(now = new Date()) {
  const [y, m, d] = localDate(now).split('-').map(Number);
  let midnight = Date.UTC(y, m - 1, d + 1) - zoneOffsetMinutes(now) * 60000;
  // A DST change between now and midnight shifts the offset once.
  midnight = Date.UTC(y, m - 1, d + 1) - zoneOffsetMinutes(new Date(midnight)) * 60000;
  return Math.max(60 * 1000, midnight - now.getTime());
}

export function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export const isIsoDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
