// Expenses by category for the expense list: total and deductible input
// VAT per category and currency, largest first.
import { add, round, deductibleVat } from '@we-invoice/core';

export function categorySummary(rows) {
  const groups = new Map();
  for (const r of rows) {
    if (r.status === 'CANCELLED') continue;
    const key = `${r.category || ''}|${r.currency}`;
    const g = groups.get(key) || { category: r.category || null, currency: r.currency, total: '0.00', deductibleVat: '0.00' };
    g.total = round(add(g.total, r.total || '0'), 2);
    if (r.doc) g.deductibleVat = round(add(g.deductibleVat, deductibleVat(r.doc, r.category)), 2);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => Number(b.total) - Number(a.total));
}
