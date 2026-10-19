// Numbering series of the open company as the sales screens use them
// (03-features.md § 3.5): the default series of a kind, created on first
// use with a mask per kind (corrections get their own series by default),
// the numbers already taken, and the preview of the next number. The
// numbering rules themselves are the core's (formatNumber, nextNumber).
import { formatNumber, nextNumber, uuidv7 } from '@we-invoice/core';

// Default masks: a two letter prefix per kind, the year and four digits.
export const DEFAULT_MASKS = Object.freeze({
  INVOICE: 'FA{YYYY}{N:4}',
  PROFORMA: 'ZF{YYYY}{N:4}',
  ADVANCE_TAX_DOC: 'DD{YYYY}{N:4}',
  CREDIT_NOTE: 'DB{YYYY}{N:4}',
  DEBIT_NOTE: 'TP{YYYY}{N:4}',
  QUOTE: 'CP{YYYY}{N:4}',
  ORDER_IN: 'OP{YYYY}{N:4}',
  ORDER_OUT: 'OV{YYYY}{N:4}',
  DELIVERY_NOTE: 'DL{YYYY}{N:4}'
});

export const NUMBERED_KINDS = Object.freeze(Object.keys(DEFAULT_MASKS));
export const SERIES_RESETS = Object.freeze(['YEARLY', 'MONTHLY', 'NEVER']);

// The series made on first use has the same id on every device: two
// devices that both issue their first invoice before syncing then number
// in one series, and the merge finds a number taken twice.
export function defaultSeriesId(kind) {
  return `series-default-${kind}`;
}

export function defaultSeries(kind, { id = uuidv7(), name = '' } = {}) {
  return { id, name, kind, mask: DEFAULT_MASKS[kind] || 'D{YYYY}{N:4}', vsMask: null, reset: 'YEARLY', isDefault: true, counters: {} };
}

/** Series of a kind, the default one first. */
export function seriesOfKind(company, kind) {
  const list = ((company && company.series) || []).filter(s => s.kind === kind && !s.deleted);
  return list.sort((a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)));
}

/**
 * The series a document is numbered in: its own when it still exists,
 * else the default of its kind, else a new default series to be stored
 * (created: true).
 * @returns {{series: object, created: boolean}}
 */
export function resolveSeries(company, kind, seriesId = null, newId = undefined) {
  const own = seriesOfKind(company, kind);
  const hit = (seriesId && own.find(s => s.id === seriesId)) || own[0];
  if (hit) return { series: hit, created: false };
  return { series: defaultSeries(kind, { id: newId || defaultSeriesId(kind) }), created: true };
}

/** The company's series list with one series replaced or added. */
export function withSeries(company, series) {
  const list = (company && company.series) || [];
  const exists = list.some(s => s.id === series.id);
  let next = exists ? list.map(s => (s.id === series.id ? series : s)) : [...list, series];
  if (series.isDefault) next = next.map(s => (s.kind === series.kind && s.id !== series.id ? { ...s, isDefault: false } : s));
  return next;
}

/** Numbers already used in a series (deleted drafts free their number). */
export function takenNumbers(documents, seriesId) {
  return new Set((documents || []).filter(d => !d.deleted && d.seriesId === seriesId && d.number).map(d => d.number));
}

/** The next number a series would give on a date, or null when the mask is invalid. */
export function previewNumber(series, date, taken = []) {
  try {
    return nextNumber(series, { date, taken }).number;
  } catch (e) {
    console.warn('Number preview failed', e);
    return null;
  }
}

/** The variable symbol the series would give on a date, or null. */
export function previewVs(series, date, taken = []) {
  try {
    return nextNumber(series, { date, taken }).vs;
  } catch (e) {
    console.warn('Variable symbol preview failed', e);
    return null;
  }
}

/** Error code of a mask, or null when it is valid (the core decides). */
export function maskError(mask, date) {
  try {
    formatNumber(String(mask || ''), { date, counter: 1 });
    return null;
  } catch (e) {
    return e && e.code ? e.code : 'SERIES_MASK_INVALID';
  }
}

/**
 * Sets the next counter of a series for the period of a date, refusing a
 * value that would give a number already taken (manual edit with
 * protection against duplicates).
 * @returns {{series: object, error: string|null}}
 */
export function setNextCounter(series, date, counter, taken = []) {
  const value = Number(counter);
  if (!Number.isInteger(value) || value < 1) return { series, error: 'SERIES_COUNTER_INVALID' };
  const probe = { ...series, counters: { ...(series.counters || {}) } };
  const { counterKey } = nextNumber(probe, { date });
  probe.counters[counterKey] = value;
  const number = formatNumber(series.mask, { date, counter: value });
  const takenSet = taken instanceof Set ? taken : new Set(taken);
  if (takenSet.has(number)) return { series, error: 'SERIES_NUMBER_TAKEN' };
  return { series: probe, error: null };
}

/** The counter the next document of a series gets on a date. */
export function nextCounterOf(series, date) {
  try {
    const { nextCounter } = nextNumber(series, { date });
    return nextCounter - 1;
  } catch (e) {
    console.warn('Series counter cannot be read', e);
    return 1;
  }
}
