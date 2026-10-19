// @vitest-environment happy-dom
// The invoice list of the test plan budget (§ 11.1): the rows of 10 000
// generated documents (totals, payment state, eFaktura duty) built and
// sorted within 200 ms, filtered by a typed query within 100 ms. Drawing
// the table is measured in components.perf.test.js, and the whole opening
// of the list in the browser in tests/e2e/large-list.spec.js.
import { describe, it, expect, beforeEach } from 'vitest';
import { documentRows, filterRows, byNewest } from '../../app/src/views/documents/rows.js';
import { listColumns } from '../../app/src/views/documents/list-columns.js';
import { LIST_ROUTES } from '../../app/src/views/documents/kinds.js';
import { createTable } from '../../app/src/components/table.js';
import { resetPrefsCache } from '../../app/src/prefs.js';
import { generateCompanyData } from '../gen/index.js';
import { best } from './budget.js';

const { company, contacts, documents } = generateCompanyData({ documents: 10000 });
const byId = new Map(contacts.map(c => [c.id, c]));

beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); resetPrefsCache(); });

describe('document list over 10 000 documents', () => {
  it('builds and sorts the rows within 200 ms', () => {
    expect(best(() => documentRows(documents, { contacts: byId, company, today: '2026-10-18' }).sort(byNewest))).toBeLessThan(200);
  });

  it('draws the invoice table of the rows', () => {
    const rows = documentRows(documents, { contacts: byId, company, today: '2026-10-18' }).sort(byNewest);
    const table = createTable({ key: 'perf-invoices', columns: listColumns(LIST_ROUTES.invoices), rows, selectable: true });
    document.body.append(table.el);
    expect(document.querySelectorAll('.data-table tr.row').length).toBeLessThan(200);
  });

  it('filters by a typed query within 100 ms', () => {
    const rows = documentRows(documents, { contacts: byId, company, today: '2026-10-18' });
    for (const query of ['FA2026', 'tatry', '2025000', 'nothing-here']) expect(best(() => filterRows(rows, { query }))).toBeLessThan(100);
  });
});
