// round() returns a stored amount as it is when big.js would give the
// same string back. This checks that shortcut against big.js itself on
// edge cases and on many random decimal strings, for 0 to 4 places.
import { describe, it, expect } from 'vitest';
import Big from 'big.js';
import { round } from './index.js';

const reference = (value, p) => new Big(value).round(p, Big.roundHalfUp).toFixed(p);

const EDGES = ['0', '-0', '0.00', '-0.00', '-0.0', '0.10', '12.30', '-5.55', '-5.5', '007.00', '1e3', '1000000000000.99', '0.005', '-0.005',
  '2.345', '-2.345', '10', '-10', '.50', '5.', ' 1.00', '1.00 ', '+1.00', '0.000', '-0.000', '123.4567', '-123.4567'];

function randomDecimal(rand) {
  const sign = rand() < 0.3 ? '-' : '';
  const whole = rand() < 0.2 ? '0' : String(Math.floor(rand() * 1e6));
  const places = Math.floor(rand() * 6);
  const frac = Array.from({ length: places }, () => Math.floor(rand() * 10)).join('');
  return places ? `${sign}${whole}.${frac}` : `${sign}${whole}`;
}

describe('round shortcut', () => {
  it('matches big.js on edge cases', () => {
    for (const value of EDGES) {
      for (let p = 0; p <= 4; p += 1) {
        let expected;
        try { expected = reference(value.trim(), p); } catch { continue; }
        expect(round(value, p), `${JSON.stringify(value)} to ${p}`).toBe(expected);
      }
    }
  });

  it('matches big.js on random decimal strings', () => {
    let seed = 7;
    const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let i = 0; i < 20000; i += 1) {
      const value = randomDecimal(rand);
      const p = i % 5;
      expect(round(value, p), `${value} to ${p}`).toBe(reference(value, p));
    }
  });

  it('still rounds numbers and refuses what is not a decimal', () => {
    expect(round(1.005, 2)).toBe(reference(1.005, 2));
    expect(() => round('abc')).toThrow(expect.objectContaining({ code: 'AMOUNT_INVALID' }));
    expect(() => round('')).toThrow(expect.objectContaining({ code: 'AMOUNT_INVALID' }));
  });
});
