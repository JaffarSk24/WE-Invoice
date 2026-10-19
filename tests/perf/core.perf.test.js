// The budgets of the test plan (§ 11.1) on the synthetic company of
// tests/gen with 10 000 documents, 400 contacts and 300 items: totals
// within 1 ms per document, search within 100 ms per query, the VAT
// records, the reports and the accountant export of a month within 200 ms.
import { describe, it, expect } from 'vitest';
import {
  computeTotals, searchIndex, searchQuery, salesReport, agingReport, vatRecords, buildKv, selectExportDocuments, exportPohoda
} from '@we-invoice/core';
import { generateCompanyData } from '../gen/index.js';
import { best, elapsed } from './budget.js';

const data = generateCompanyData({ documents: 10000 });
const { company, documents, contacts, items } = data;

describe('core over 10 000 documents', () => {
  it('computes the totals of a document within 1 ms on average', () => {
    computeTotals(documents[0]);
    const ms = elapsed(() => documents.forEach(d => computeTotals(d)));
    expect(ms / documents.length).toBeLessThan(1);
  });

  it('answers a search within 100 ms per query', () => {
    const index = searchIndex({ documents, contacts, items });
    for (const query of ['FA2026', '202600017', 'kovac', 'Tatry Servis', 'licencia 12', 'zzz-nothing']) {
      expect(best(() => searchQuery(index, query))).toBeLessThan(100);
    }
  });

  it('builds the search index within 200 ms', () => {
    expect(best(() => searchIndex({ documents, contacts, items }))).toBeLessThan(200);
  });

  it('draws the reports within 200 ms', () => {
    const ctx = { from: '2026-01-01', to: '2026-12-31', granularity: 'month' };
    expect(best(() => salesReport(documents, ctx))).toBeLessThan(200);
    expect(best(() => agingReport(documents, '2026-10-18'))).toBeLessThan(200);
  });

  it('gives the VAT records and the KV of a month within 200 ms', () => {
    expect(best(() => vatRecords(documents, '2026-09', company))).toBeLessThan(200);
    expect(best(() => buildKv(vatRecords(documents, '2026-09', company), { company, today: '2026-10-10' }))).toBeLessThan(200);
  });

  it('writes the Pohoda XML of a month within 200 ms', () => {
    const range = { from: '2026-09-01', to: '2026-09-30' };
    expect(selectExportDocuments(documents, range).length).toBeGreaterThan(300);
    expect(best(() => exportPohoda({ company, documents, contacts }, range))).toBeLessThan(200);
  });
});
