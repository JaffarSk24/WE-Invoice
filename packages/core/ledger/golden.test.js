// Golden years of tests/fixtures/ledger/*.json: the documents, manual
// entries, assets and trips of a year go through the automatic entries
// and the year closing (or the flat-rate summary); the expected values
// were computed by hand. A case lists only the values it checks.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { planEntrySync } from './sync-plan.js';
import { yearClosing } from './closing.js';
import { flatSummary, incomeRecords } from './flat.js';

const dir = new URL('../../../tests/fixtures/ledger/', import.meta.url);
const cases = readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => ({ file: f, ...JSON.parse(readFileSync(new URL(f, dir), 'utf8')) }));

// Fills the fields a fixture leaves out, so the files stay short.
function expandDocument(d) {
  return {
    status: 'ISSUED', currency: 'EUR', buyer: { name: 'Odberateľ' }, seller: { name: 'Dodávateľ' }, ...d,
    lines: d.lines.map((l, i) => ({ id: `${d.id}-l${i}`, name: 'item', qty: '1', ...l })),
    payments: (d.payments || []).map((p, i) => ({ id: `${d.id}-p${i}`, method: 'TRANSFER', source: 'MANUAL', currency: d.currency || 'EUR', ...p }))
  };
}

const byCode = (rows) => Object.fromEntries(rows.map(r => [r.code, r.amount]));
const pick = (actual, expected) => Object.fromEntries(Object.keys(expected).map(k => [k, actual[k]]));

function run(c) {
  const documents = (c.documents || []).map(expandDocument);
  const plan = planEntrySync({ documents, entries: c.entries || [], company: c.company, bankTransactions: c.bankTransactions || [] });
  const entries = [...(c.entries || []), ...plan.insert];
  if (c.mode === 'TAX_RECORDS_FLAT') return { flat: flatSummary({ entries, year: c.year }), records: incomeRecords(entries, c.year) };
  return {
    closing: yearClosing({
      year: c.year, entries, documents, assets: c.assets || [], trips: c.trips || [],
      bankTransactions: c.bankTransactions || [], company: c.company, initial: c.initial || {}, inputs: c.inputs || {}
    })
  };
}

describe('golden ledger years', () => {
  it('has at least 8 scenarios', () => {
    expect(cases.length).toBeGreaterThanOrEqual(8);
  });

  it.each(cases.map(c => [`${c.file}: ${c.name}`, c]))('%s', (_, c) => {
    const result = run(c);
    const x = c.expected;
    if (c.mode === 'TAX_RECORDS_FLAT') {
      expect(pick(result.flat, x.flat)).toEqual(x.flat);
      if (x.incomeRecordsTotal) expect(result.records.total).toBe(x.incomeRecordsTotal);
      return;
    }
    const r = result.closing;
    if (x.totals) expect(pick(r.journal.totals, x.totals)).toEqual(x.totals);
    if (x.opening) expect(r.journal.opening).toEqual(x.opening);
    if (x.closing) expect(r.journal.closing).toEqual(x.closing);
    if (x.incomeExpense) expect(pick(byCode(r.incomeExpense.rows), x.incomeExpense)).toEqual(x.incomeExpense);
    if (x.assetsLiabilities) expect(pick(byCode(r.assetsLiabilities.rows), x.assetsLiabilities)).toEqual(x.assetsLiabilities);
    if (x.nonTaxIncome) expect(r.incomeExpense.nonTaxIncome).toBe(x.nonTaxIncome);
    if (x.uncategorized) expect(r.summary.uncategorized).toBe(x.uncategorized);
    if (x.receivables) expect(r.receivables.total).toBe(x.receivables);
    if (x.payables) expect(r.payables.total).toBe(x.payables);
    if (x.carryForward) expect(r.carryForward).toEqual(x.carryForward);
    if (x.disposals) expect(r.disposals.map(d => ({ assetId: d.assetId, residual: d.residual }))).toEqual(x.disposals);
    if (x.checklist) expect(pick(Object.fromEntries(r.checklist.map(i => [i.id, i.ok])), x.checklist)).toEqual(x.checklist);
    if (x.ready !== undefined) expect(r.ready).toBe(x.ready);
  });
});
