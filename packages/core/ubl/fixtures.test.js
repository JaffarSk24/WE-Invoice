// UBL fixtures (tests/fixtures/ubl): every valid case builds to its
// expected XML, reads back without differences in the totals and builds to
// the same XML again from what was read; every invalid case reports its
// issue codes. The same XML is checked by the official Schematron in CI.
import { describe, it, expect } from 'vitest';
import { buildUbl, parseUbl, validateUblLocal } from './index.js';
import { computeTotals } from '../vat/index.js';
import { UBL_CASES, UBL_INVALID_CASES, expectedPath } from '../../../tests/fixtures/ubl/load.js';

describe('UBL fixtures', () => {
  it('has at least 20 valid cases', () => {
    expect(UBL_CASES.length).toBeGreaterThanOrEqual(20);
  });

  it.each(UBL_CASES.map(c => [c.id, c]))('%s builds to the expected XML', async (id, c) => {
    const xml = buildUbl(c.document, c.company, c.options);
    await expect(xml).toMatchFileSnapshot(`../../../${expectedPath(id)}`);
  });

  it.each(UBL_CASES.map(c => [c.id, c]))('%s reads back (build, parse, build)', (_id, c) => {
    const xml = buildUbl(c.document, c.company, c.options);
    const { document, warnings } = parseUbl(xml);
    expect(warnings).toEqual([]);
    expect(document.number).toBe(c.document.number);
    expect(document.currency).toBe(c.document.currency);
    const totals = computeTotals(c.document, { prepaid: c.options.prepaid, cashRounding: c.options.cashRounding });
    const sign = document.kind === 'CREDIT_NOTE' && totals.gross.startsWith('-') ? -1 : 1;
    const abs = (v) => (sign < 0 ? v.replace(/^-/, '') : v);
    expect(document.totals.payable).toBe(abs(totals.payable));
    expect(document.totals.vat).toBe(abs(totals.vat));
    // What was read is enough to write the same e-invoice again.
    // The rate is not in the XML (only BT-111 is), so it comes from the case.
    const again = buildUbl({ ...document, fxRate: c.document.fxRate ?? null }, {}, {
      preceding: document.preceding, prepaid: document.totals.prepaid,
      pdf: c.options.pdf, note: document.textIntro, noLegalNotes: true
    });
    expect(again).toBe(xml);
  });

  it.each(UBL_INVALID_CASES.map(c => [c.id, c]))('%s reports its issues', (_id, c) => {
    const codes = validateUblLocal(c.document, c.company, c.options).map(i => i.code);
    expect(codes).toEqual(expect.arrayContaining(c.expect));
  });
});
