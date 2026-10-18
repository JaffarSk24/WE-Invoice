// Money arithmetic: decimal strings in, decimal strings out, half-up
// rounding, Slovak cash rounding, locale display and tolerant parsing.
import { describe, it, expect } from 'vitest';
import {
  add, sub, mul, div, cmp, round, sum, isZero, isNegative, abs, neg, roundCash, formatAmount, parseAmount, convert
} from './index.js';
import { CoreError } from '../errors.js';

const plain = (s) => s.replace(/[\u00a0\u202f]/g, ' ');

describe('arithmetic', () => {
  it('adds and subtracts without float errors', () => {
    expect(add('0.1', '0.2')).toBe('0.3');
    expect(sub('1', '0.9')).toBe('0.1');
    expect(add(1, 2)).toBe('3');
    expect(sub('5', '5')).toBe('0');
  });

  it('multiplies and divides', () => {
    expect(mul('19.99', '3')).toBe('59.97');
    expect(mul('1.1', '1.1')).toBe('1.21');
    expect(div('10', '3')).toBe('3.3333333333');
    expect(div('10', '3', 2)).toBe('3.33');
    expect(div('2', '3', 2)).toBe('0.67');
    expect(div('1', '8', 0)).toBe('0');
  });

  it('never returns exponent notation', () => {
    expect(mul('1000000000000', '1000000000000')).toBe('1000000000000000000000000');
    expect(div('1', '100000000', 8)).toBe('0.00000001');
    expect(sub('0.0000000001', '0.0000000001')).toBe('0');
  });

  it('compares', () => {
    expect(cmp('1.00', '1')).toBe(0);
    expect(cmp('1.01', '1.1')).toBe(-1);
    expect(cmp('-1', '-2')).toBe(1);
  });

  it('sums a list and handles the empty one', () => {
    expect(sum(['1.1', '2.2', '3.3'])).toBe('6.6');
    expect(sum([])).toBe('0');
  });

  it('sign helpers', () => {
    expect(isZero('0.00')).toBe(true);
    expect(isZero('0.01')).toBe(false);
    expect(isNegative('-0.01')).toBe(true);
    expect(isNegative('0')).toBe(false);
    expect(abs('-3.5')).toBe('3.5');
    expect(neg('3.5')).toBe('-3.5');
    expect(neg('0')).toBe('0');
  });

  it('rejects garbage with AMOUNT_INVALID', () => {
    for (const bad of ['abc', '', null, undefined, '1,5', NaN, Infinity, '1.2.3']) {
      expect(() => add(bad, '1')).toThrow(CoreError);
      try { add(bad, '1'); } catch (e) { expect(e.code).toBe('AMOUNT_INVALID'); }
    }
  });

  it('rejects division by zero with its own code', () => {
    expect(() => div('1', '0')).toThrow(/division/);
    try { div('1', '0'); } catch (e) { expect(e.code).toBe('DIVISION_BY_ZERO'); }
  });

  it('rejects places out of range', () => {
    expect(() => round('1', -1)).toThrow(CoreError);
    expect(() => round('1', 21)).toThrow(CoreError);
    expect(() => div('1', '3', 1.5)).toThrow(CoreError);
  });
});

describe('round', () => {
  it('rounds half-up to 2 places by default', () => {
    expect(round('1.005')).toBe('1.01');
    expect(round('1.015')).toBe('1.02');
    expect(round('1.025')).toBe('1.03');
    expect(round('2.675')).toBe('2.68');
    expect(round('1.004')).toBe('1.00');
    expect(round('1')).toBe('1.00');
  });

  it('rounds negatives away from zero on a tie', () => {
    expect(round('-1.005')).toBe('-1.01');
    expect(round('-1.004')).toBe('-1.00');
  });

  it('supports other precisions', () => {
    expect(round('1.23456', 4)).toBe('1.2346');
    expect(round('1.5', 0)).toBe('2');
    expect(round('0.5', 0)).toBe('1');
    expect(round('123.456', 1)).toBe('123.5');
  });
});

describe('roundCash', () => {
  it.each([
    ['10.01', '10.00', '-0.01'],
    ['10.02', '10.00', '-0.02'],
    ['10.03', '10.05', '0.02'],
    ['10.04', '10.05', '0.01'],
    ['10.05', '10.05', '0'],
    ['10.06', '10.05', '-0.01'],
    ['10.07', '10.05', '-0.02'],
    ['10.08', '10.10', '0.02'],
    ['10.09', '10.10', '0.01'],
    ['10.10', '10.10', '0'],
    ['0.00', '0.00', '0'],
    ['99.98', '100.00', '0.02']
  ])('%s becomes %s (rounding %s)', (input, amount, rounding) => {
    expect(roundCash(input)).toEqual({ amount, rounding });
  });

  it('rounds 1 to 4 cents up to 5 cents', () => {
    expect(roundCash('0.01')).toEqual({ amount: '0.05', rounding: '0.04' });
    expect(roundCash('0.02')).toEqual({ amount: '0.05', rounding: '0.03' });
    expect(roundCash('0.04')).toEqual({ amount: '0.05', rounding: '0.01' });
  });

  it('rounds negative amounts (credit notes) symmetrically', () => {
    expect(roundCash('-10.03')).toEqual({ amount: '-10.05', rounding: '-0.02' });
    expect(roundCash('-10.02')).toEqual({ amount: '-10.00', rounding: '0.02' });
    expect(roundCash('-0.02')).toEqual({ amount: '-0.05', rounding: '-0.03' });
  });

  it('accepts another step and rejects a bad one', () => {
    expect(roundCash('10.26', '0.5')).toEqual({ amount: '10.50', rounding: '0.24' });
    expect(roundCash('10.24', '0.5')).toEqual({ amount: '10.00', rounding: '-0.24' });
    expect(() => roundCash('1', '0')).toThrow(CoreError);
  });
});

describe('formatAmount', () => {
  it('formats by locale and currency', () => {
    expect(plain(formatAmount('1234.5', 'EUR', 'sk-SK'))).toBe('1 234,50 €');
    expect(plain(formatAmount('1234.5', 'EUR', 'en-GB'))).toBe('€1,234.50');
    expect(plain(formatAmount('1234.5', 'CZK', 'cs-CZ'))).toBe('1 234,50 Kč');
    expect(plain(formatAmount('-12', 'EUR', 'de-DE'))).toBe('-12,00 €');
  });

  it('keeps every digit of a large amount', () => {
    expect(plain(formatAmount('12345678901234567.89', 'EUR', 'en-US'))).toBe('€12,345,678,901,234,567.89');
  });

  it('defaults to Slovak and EUR and accepts explicit places', () => {
    expect(plain(formatAmount('2'))).toBe('2,00 €');
    expect(plain(formatAmount('2.5', 'EUR', 'sk-SK', { places: 0 }))).toBe('3 €');
    expect(plain(formatAmount('2.12345', 'EUR', 'en-GB', { places: 4 }))).toBe('€2.1235');
    expect(plain(formatAmount('1', 'EUR', 'en-GB', { currencyDisplay: 'code' }))).toBe('EUR 1.00');
  });

  it('rejects an invalid amount', () => {
    expect(() => formatAmount('x', 'EUR', 'sk-SK')).toThrow(CoreError);
  });
});

describe('parseAmount', () => {
  it.each([
    ['1234,50', '1234.5'],
    ['1234.50', '1234.5'],
    ['1 234,50', '1234.5'],
    ['1\u00a0234,50', '1234.5'],
    ['1,234.50', '1234.5'],
    ['1.234,50', '1234.5'],
    ['1,234,567.89', '1234567.89'],
    ['1.234.567,89', '1234567.89'],
    ['1,234,567', '1234567'],
    ['1.234.567', '1234567'],
    ['12', '12'],
    ['-12,5', '-12.5'],
    ['+12,5', '12.5'],
    ['0,5', '0.5'],
    [',5', '0.5'],
    ['5,', '5'],
    ['12,50 €', '12.5'],
    ['€12.50', '12.5'],
    ['12,50 EUR', '12.5'],
    ['CZK 1 000', '1000'],
    ['  7  ', '7'],
    ['1\'234.50', '1234.5'],
    ['0', '0'],
    ['-0', '0']
  ])('"%s" parses to %s', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each(['', '   ', 'abc', '1,2.3,4', '1.2,3.4', '--1', '1-2', ',', '.', '€', null, undefined, '1e5'])('rejects "%s"', (input) => {
    expect(parseAmount(input)).toBeNull();
  });

  it('accepts numbers', () => {
    expect(parseAmount(12.5)).toBe('12.5');
    expect(parseAmount(NaN)).toBeNull();
  });
});

describe('convert', () => {
  it('multiplies by a rate and rounds', () => {
    expect(convert('100', '1.1')).toBe('110.00');
    expect(convert('100', '0.0396825397')).toBe('3.97');
    expect(convert('123.456', '1', 3)).toBe('123.456');
  });

  it('EUR from a document currency goes through div with the ECB rate', () => {
    expect(div('2520', '25.2', 2)).toBe('100');
    expect(round(div('2520', '25.2'), 2)).toBe('100.00');
  });
});
