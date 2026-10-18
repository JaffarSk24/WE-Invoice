// Calendar dates: local "today" in Bratislava, day arithmetic, validation.
import { describe, it, expect } from 'vitest';
import { localDate, addDays, diffDays, assertDate, isDate, dateParts } from './dates.js';

const code = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };

describe('localDate', () => {
  it('is the Bratislava date, not the UTC one', () => {
    expect(localDate('2026-10-31T23:30:00.000Z')).toBe('2026-11-01');
    expect(localDate('2026-01-31T23:30:00.000Z')).toBe('2026-02-01');
    expect(localDate('2026-07-31T22:30:00.000Z')).toBe('2026-08-01');
    expect(localDate(new Date('2026-03-29T00:30:00.000Z'))).toBe('2026-03-29');
    expect(localDate(Date.UTC(2026, 11, 31, 23, 0))).toBe('2027-01-01');
  });

  it('honours another zone and defaults to now', () => {
    expect(localDate('2026-10-31T23:30:00.000Z', 'UTC')).toBe('2026-10-31');
    expect(localDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(code(() => localDate('nonsense'))).toBe('DATE_INVALID');
  });
});

describe('addDays and diffDays', () => {
  it('cross month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-10-18', 14)).toBe('2026-11-01');
    expect(addDays('2026-10-18', 0)).toBe('2026-10-18');
  });

  it('count whole days in either direction', () => {
    expect(diffDays('2026-10-18', '2026-11-01')).toBe(14);
    expect(diffDays('2026-11-01', '2026-10-18')).toBe(-14);
    expect(diffDays('2026-10-18', '2026-10-18')).toBe(0);
    expect(diffDays('2025-12-31', '2027-01-01')).toBe(366);
  });
});

describe('assertDate, isDate, dateParts', () => {
  it('accept real dates only', () => {
    expect(assertDate('2026-02-28')).toBe('2026-02-28');
    expect(isDate('2026-02-29')).toBe(false);
    expect(isDate('2024-02-29')).toBe(true);
    expect(isDate('2026-10-18T00:00:00Z')).toBe(false);
    expect(isDate('')).toBe(false);
    expect(isDate(null)).toBe(false);
    expect(code(() => assertDate('18.10.2026'))).toBe('DATE_INVALID');
    expect(code(() => addDays('2026-13-01', 1))).toBe('DATE_INVALID');
    expect(code(() => diffDays('2026-01-01', 'x'))).toBe('DATE_INVALID');
  });

  it('splits a date', () => {
    expect(dateParts('2026-10-18')).toEqual({ year: '2026', month: '10', day: '18' });
  });
});
