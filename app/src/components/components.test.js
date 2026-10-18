// Pure logic of the components: decimals, dates, virtual scrolling,
// column choice, row sorting, undo, status styles, filters.
import { describe, it, expect, beforeEach } from 'vitest';
import { performance } from 'node:perf_hooks';
import { parseDecimal, sum, round, cmp, toInputText } from './decimal.js';
import { todayLocal, addDays, daysBetween, periodRange, inRange, daysInMonth } from './dates.js';
import { visibleRange } from './virtual-list.js';
import { visibleColumnIds, saveColumnChoice, loadColumnChoice } from './table-columns.js';
import { sortRows } from './table.js';
import { createUndoable } from './undo-toast.js';
import { STATUS_STYLES, statusStyle } from './status-badge.js';
import { saveFilter, savedFilters, deleteSavedFilter, resolveFilter, EMPTY_FILTER } from './filter-bar.js';
import { schema } from '@we-invoice/core';
import { sk } from '../i18n/sk/index.js';
import { en } from '../i18n/en/index.js';
import { resetPrefsCache } from '../prefs.js';

describe('decimal input', () => {
  it('accepts comma and dot, spaces and currency', () => {
    expect(parseDecimal('12,50')).toBe('12.5');
    expect(parseDecimal('1 234.50 €')).toBe('1234.5');
    expect(parseDecimal('-3')).toBe('-3');
    expect(parseDecimal('abc')).toBe(null);
    expect(parseDecimal('')).toBe(null);
    expect(parseDecimal('1,2,3')).toBe(null);
  });
  it('adds without float errors', () => {
    expect(sum(['0.1', '0.2'])).toBe('0.3');
    expect(sum(['', null, '5'])).toBe('5');
    expect(round('2.345')).toBe('2.35');
    expect(cmp('10', '9.99')).toBe(1);
  });
  it('shows the decimal separator of the language', () => {
    expect(toInputText('12.5', 'sk')).toBe('12,5');
    expect(toInputText('12.5', 'en')).toBe('12.5');
    expect(toInputText(null, 'sk')).toBe('');
  });
});

describe('dates', () => {
  it('takes today in Bratislava, not UTC', () => {
    expect(todayLocal(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
    expect(todayLocal(new Date('2026-07-01T21:59:00Z'))).toBe('2026-07-01');
    expect(todayLocal(new Date('2026-07-01T22:01:00Z'))).toBe('2026-07-02');
  });
  it('does calendar arithmetic without time zones', () => {
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysInMonth(2028, 2)).toBe(29);
  });
  it('resolves period presets', () => {
    expect(periodRange('thisMonth', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(periodRange('lastMonth', '2026-01-10')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(periodRange('thisQuarter', '2026-05-10')).toEqual({ from: '2026-04-01', to: '2026-06-30' });
    expect(periodRange('all', '2026-05-10')).toEqual({ from: null, to: null });
    expect(inRange('2026-05-01', { from: '2026-04-01', to: '2026-06-30' })).toBe(true);
    expect(inRange('2026-07-01', { from: '2026-04-01', to: '2026-06-30' })).toBe(false);
  });
});

describe('virtual scrolling', () => {
  it('draws only the visible rows plus overscan', () => {
    expect(visibleRange({ scrollTop: 0, viewportHeight: 480, rowHeight: 48, total: 10000, overscan: 5 })).toEqual({ start: 0, end: 16 });
    const mid = visibleRange({ scrollTop: 48 * 5000, viewportHeight: 480, rowHeight: 48, total: 10000, overscan: 5 });
    expect(mid).toEqual({ start: 4995, end: 5016 });
    expect(visibleRange({ scrollTop: 48 * 9999, viewportHeight: 480, rowHeight: 48, total: 10000 }).end).toBe(10000);
    expect(visibleRange({ scrollTop: 0, viewportHeight: 480, rowHeight: 48, total: 0 })).toEqual({ start: 0, end: 0 });
  });
  it('computes the range for 10 000 rows fast', () => {
    const t0 = performance.now();
    for (let i = 0; i < 10000; i++) visibleRange({ scrollTop: i * 48, viewportHeight: 800, rowHeight: 48, total: 10000 });
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

describe('columns and sorting', () => {
  beforeEach(() => { localStorage.clear(); resetPrefsCache(); });
  const columns = [{ id: 'number', always: true }, { id: 'contact' }, { id: 'note', hidden: true }, { id: 'total' }];
  it('uses defaults, then the saved choice, keeping fixed columns', () => {
    expect(visibleColumnIds(columns, null)).toEqual(['number', 'contact', 'total']);
    expect(visibleColumnIds(columns, ['note', 'unknown'])).toEqual(['number', 'note']);
    saveColumnChoice('invoices', ['total']);
    expect(loadColumnChoice('invoices')).toEqual(['total']);
  });
  it('sorts numbers and texts', () => {
    const rows = [{ n: 'FA10', v: 3 }, { n: 'FA9', v: 1 }, { n: 'FA2', v: 2 }];
    expect(sortRows(rows, { sortValue: r => r.n }, 'asc').map(r => r.n)).toEqual(['FA2', 'FA9', 'FA10']);
    expect(sortRows(rows, { sortValue: r => r.v }, 'desc').map(r => r.v)).toEqual([3, 2, 1]);
    expect(sortRows(rows, null, 'asc')).toBe(rows);
  });
});

describe('saved filters', () => {
  beforeEach(() => { localStorage.clear(); resetPrefsCache(); });
  it('saves, replaces and deletes by name', () => {
    saveFilter('inv', 'Open', { ...EMPTY_FILTER, status: 'SENT' });
    saveFilter('inv', 'Open', { ...EMPTY_FILTER, status: 'OVERDUE' });
    expect(savedFilters('inv')).toHaveLength(1);
    expect(savedFilters('inv')[0].filter.status).toBe('OVERDUE');
    deleteSavedFilter('inv', 'Open');
    expect(savedFilters('inv')).toEqual([]);
  });
  it('resolves the preset into bounds', () => {
    expect(resolveFilter({ ...EMPTY_FILTER, preset: 'thisYear' }, '2026-05-05')).toMatchObject({ from: '2026-01-01', to: '2026-12-31' });
    expect(resolveFilter({ ...EMPTY_FILTER, preset: 'custom', from: '2026-01-05', to: null })).toMatchObject({ from: '2026-01-05', to: null });
  });
});

describe('undo', () => {
  it('commits once unless undone', () => {
    let committed = 0;
    let reverted = 0;
    const a = createUndoable({ commit: () => committed++, revert: () => reverted++ });
    expect(a.settle()).toBe(true);
    expect(a.settle()).toBe(false);
    expect(a.undo()).toBe(false);
    const b = createUndoable({ commit: () => committed++, revert: () => reverted++ });
    expect(b.undo()).toBe(true);
    expect(b.settle()).toBe(false);
    expect([committed, reverted]).toEqual([1, 1]);
  });
});

describe('status badge', () => {
  it('has a style, an icon and a text for every status', () => {
    schema.DOCUMENT_STATUSES.forEach(s => {
      expect(STATUS_STYLES[s], s).toBeTruthy();
      expect(sk[`status.${s}`], s).toBeTruthy();
      expect(en[`status.${s}`], s).toBeTruthy();
    });
    expect(statusStyle('CANCELLED').strike).toBe(true);
    expect(statusStyle('UNKNOWN').tone).toBe('draft');
    expect(sk['status.DELIVERED']).toBeTruthy();
  });
});
