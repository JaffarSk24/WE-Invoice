import { describe, it, expect } from 'vitest';
import { depreciationPlan, depreciationInYear, depreciationRows, accountingPlan, isLowValue } from './depreciation.js';
import { residualAt } from './statements.js';
import { sum } from '../money/index.js';

const asset = (over = {}) => ({ id: 'a1', name: 'PC', kind: 'TANGIBLE', acquiredOn: '2026-01-10', inUseFrom: null, cost: '12000', depreciationGroup: 1, method: 'STRAIGHT', ...over });
const years = (a) => depreciationPlan(a).plan.map(p => [p.year, p.amount]);

describe('straight depreciation in every group', () => {
  // group, years
  const GROUPS = [[0, 2], [1, 4], [2, 6], [3, 8], [4, 12], [5, 20], [6, 40]];

  it.each(GROUPS)('group %i over %i years from January', (g, n) => {
    const plan = depreciationPlan(asset({ depreciationGroup: g, cost: '120000', acquiredOn: '2026-01-01' }));
    expect(plan.years).toBe(n);
    expect(plan.plan).toHaveLength(n);
    expect(sum(plan.plan.map(p => p.amount))).toBe('120000');
    expect(plan.plan[plan.plan.length - 1].residual).toBe('0.00');
  });

  it.each(GROUPS)('group %i over %i years plus one from July', (g, n) => {
    const plan = depreciationPlan(asset({ depreciationGroup: g, cost: '120000', acquiredOn: '2026-07-31' })).plan;
    expect(plan).toHaveLength(n + 1);
    expect(plan[0].amount).toBe((120000 / n / 2).toFixed(2));
    expect(sum(plan.map(p => p.amount))).toBe('120000');
  });

  it('counts the month of use as a whole month', () => {
    expect(years(asset({ cost: '2000', acquiredOn: '2024-07-01' }))).toEqual([[2024, '250.00'], [2025, '500.00'], [2026, '500.00'], [2027, '500.00'], [2028, '250.00']]);
    expect(years(asset({ cost: '2400', acquiredOn: '2026-12-31' }))[0]).toEqual([2026, '50.00']);
  });

  it('rounds each year up to whole euros', () => {
    expect(years(asset({ cost: '1999.99', acquiredOn: '2026-01-01' }))).toEqual([[2026, '500.00'], [2027, '500.00'], [2028, '500.00'], [2029, '499.99']]);
  });

  it('starts from the date of use when given', () => {
    expect(years(asset({ cost: '2400', acquiredOn: '2025-11-01', inUseFrom: '2026-01-15' }))[0]).toEqual([2026, '600.00']);
  });
});

describe('accelerated depreciation (§ 28)', () => {
  it('follows the Financial Administration example for group 2', () => {
    const plan = depreciationPlan(asset({ cost: '2300', depreciationGroup: 2, method: 'ACCELERATED', acquiredOn: '2025-03-10' })).plan;
    expect(plan.map(p => [p.year, p.amount, p.residual])).toEqual([
      [2025, '320.00', '1980.00'], [2026, '660.00', '1320.00'], [2027, '528.00', '792.00'],
      [2028, '396.00', '396.00'], [2029, '264.00', '132.00'], [2030, '132.00', '0.00']
    ]);
  });

  it('runs group 3 over 8 years from January', () => {
    const plan = depreciationPlan(asset({ cost: '9000', depreciationGroup: 3, method: 'ACCELERATED', acquiredOn: '2026-01-01' })).plan;
    expect(plan).toHaveLength(8);
    expect(plan[0].amount).toBe('1125.00');
    expect(plan[1].amount).toBe('1969.00');
    expect(sum(plan.map(p => p.amount))).toBe('9000');
  });

  it.each([0, 1, 4, 5, 6])('is not allowed in group %i', (g) => {
    expect(() => depreciationPlan(asset({ depreciationGroup: g, method: 'ACCELERATED' }))).toThrow(expect.objectContaining({ code: 'LEDGER_ACCELERATED_NOT_ALLOWED' }));
  });
});

describe('thresholds, disposal and errors', () => {
  it('treats a cost up to the threshold as an expense', () => {
    expect(isLowValue(asset({ cost: '1700' }))).toBe(true);
    expect(isLowValue(asset({ cost: '1700.01' }))).toBe(false);
    expect(isLowValue(asset({ cost: '2400', kind: 'INTANGIBLE' }))).toBe(true);
    expect(depreciationPlan(asset({ cost: '1000' }))).toMatchObject({ lowValue: true, plan: [] });
  });

  it('stops at disposal with the whole months before it', () => {
    const plan = depreciationPlan(asset({ cost: '4800', acquiredOn: '2025-01-01', disposedOn: '2026-10-15' }));
    expect(plan.plan.map(p => [p.year, p.amount])).toEqual([[2025, '1200.00'], [2026, '900.00']]);
    expect(plan.disposal).toEqual({ year: 2026, residual: '2700.00' });
  });

  it('handles a disposal in the year of use', () => {
    const plan = depreciationPlan(asset({ cost: '4800', acquiredOn: '2026-03-01', disposedOn: '2026-10-01' }));
    expect(plan.plan).toEqual([{ year: 2026, amount: '700.00', residual: '4100.00', booked: false }]);
  });

  it('keeps the booked flags of the stored plan', () => {
    const plan = depreciationPlan(asset({ cost: '4800', acquiredOn: '2026-01-01', plan: [{ year: 2026, amount: '1200', booked: true }] })).plan;
    expect(plan[0].booked).toBe(true);
    expect(plan[1].booked).toBe(false);
  });

  it('refuses an unknown group, a zero cost and a date before the rules', () => {
    expect(() => depreciationPlan(asset({ depreciationGroup: 9 }))).toThrow(expect.objectContaining({ code: 'LEDGER_DEPRECIATION_GROUP_INVALID' }));
    expect(() => depreciationPlan(asset({ cost: '0' }))).toThrow(expect.objectContaining({ code: 'AMOUNT_INVALID' }));
    expect(() => depreciationPlan(asset({ acquiredOn: '2019-12-31' }))).toThrow(expect.objectContaining({ code: 'LEGISLATION_NOT_IN_FORCE' }));
  });

  it('gives the amount of a year, the journal rows and the residual value', () => {
    const a = asset({ cost: '4800', acquiredOn: '2026-01-01', inventoryNumber: 'M1' });
    expect(depreciationInYear(a, 2027)).toBe('1200.00');
    expect(depreciationInYear(a, 2035)).toBe('0.00');
    expect(depreciationRows([a, asset({ id: 'small', cost: '100' }), { ...a, id: 'x', deleted: true }], 2026))
      .toEqual([{ id: 'dep:a1:2026', date: '2026-12-31', number: 'M1', text: 'PC', category: 'EXPENSE_TAX_OTHER', amount: '1200.00', assetId: 'a1' }]);
    expect(residualAt(a, 2025)).toBe('0.00');
    expect(residualAt(a, 2026)).toBe('3600.00');
    expect(residualAt(a, 2040)).toBe('0.00');
    expect(residualAt({ ...a, disposedOn: '2027-05-01' }, 2027)).toBe('0.00');
    expect(residualAt(asset({ cost: '100' }), 2026)).toBe('0.00');
  });
});

describe('accounting plan', () => {
  it('spreads the cost monthly from the month of use', () => {
    expect(accountingPlan(asset({ cost: '1200', acquiredOn: '2026-10-05' }), { lifeMonths: 12 }))
      .toEqual([{ year: 2026, amount: '300.00', residual: '900.00' }, { year: 2027, amount: '900.00', residual: '0.00' }]);
  });

  it('defaults to the tax years and refuses a bad life', () => {
    expect(accountingPlan(asset({ cost: '4800', acquiredOn: '2026-01-01' }))).toHaveLength(4);
    expect(() => accountingPlan(asset(), { lifeMonths: -1 })).toThrow(expect.objectContaining({ code: 'LEDGER_LIFE_INVALID' }));
  });
});
