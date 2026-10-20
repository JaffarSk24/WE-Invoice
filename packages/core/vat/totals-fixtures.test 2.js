// Runs every case of tests/fixtures/totals/*.json through computeTotals and
// compares the expected BT values. A case lists only the fields it cares
// about; breakdown entries and lines are compared on the keys given.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { computeTotals } from './index.js';

const dir = new URL('../../../tests/fixtures/totals/', import.meta.url);
const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort();
const cases = files.flatMap(f => JSON.parse(readFileSync(new URL(f, dir), 'utf8')).cases.map(c => ({ ...c, file: f })));

function pick(actual, expected) {
  const out = {};
  for (const key of Object.keys(expected)) out[key] = actual?.[key];
  return out;
}

describe('totals fixtures', () => {
  it('has at least 50 cases', () => {
    expect(cases.length).toBeGreaterThanOrEqual(50);
  });

  it.each(cases.map(c => [`${c.file}: ${c.name}`, c]))('%s', (_, c) => {
    const totals = computeTotals(c.document, c.options || {});
    const { breakdown, lines, docAllowances, ...scalars } = c.expected;
    expect(pick(totals, scalars)).toEqual(scalars);
    if (breakdown) {
      expect(totals.breakdown.length).toBe(breakdown.length);
      breakdown.forEach((b, i) => expect(pick(totals.breakdown[i], b)).toEqual(b));
    }
    if (lines) {
      lines.forEach(l => {
        const actual = totals.lines.find(x => x.id === l.id);
        expect(actual, `line ${l.id}`).toBeTruthy();
        expect(pick(actual, l)).toEqual(l);
      });
    }
    if (docAllowances) expect(totals.docAllowances).toEqual(docAllowances);
  });

  it('BR-CO-13..16 hold for every case', () => {
    for (const c of cases) {
      const t = computeTotals(c.document, c.options || {});
      const sum = (xs) => xs.reduce((a, b) => a + Math.round(Number(b) * 100), 0);
      expect(sum([t.lineNet, '-' + t.allowances, t.charges])).toBe(Math.round(Number(t.net) * 100));
      expect(sum(t.breakdown.map(b => b.vat))).toBe(Math.round(Number(t.vat) * 100));
      expect(sum([t.net, t.vat])).toBe(Math.round(Number(t.gross) * 100));
      expect(sum([t.gross, '-' + t.prepaid, t.rounding])).toBe(Math.round(Number(t.payable) * 100));
      expect(sum(t.lines.map(l => l.net))).toBe(Math.round(Number(t.lineNet) * 100));
    }
  });
});
