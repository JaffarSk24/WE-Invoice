// @vitest-environment happy-dom
// The screens of the reports module in a DOM: the reports draw every tab
// from the demo data, the chart scales its axis, the search dialog
// provider lists results and opens them, the search screen reads its
// query from the address, the recycle bin restores, and the change log
// shows the entries of one record.
import { describe, it, expect, beforeEach } from 'vitest';
import { createStore, memoryAdapter } from '../../store/index.js';
import { emit } from '../../events.js';
import { setPref, resetPrefsCache } from '../../prefs.js';
import { resetSearchCache } from '../search/engine.js';
import { renderReports, REPORT_TABS } from './index.js';
import { barChart, niceScale } from './chart.js';
import { renderTrash } from './trash.js';
import { renderAudit, entityIdFromHash, describeChange } from './audit.js';
import { csvText, safeFileName } from './export.js';
import { resolvePeriod } from './period.js';
import { periodLabel, changeText } from './format.js';
import { handlePaletteQuery, searchRoute } from '../search/palette.js';
import { renderSearch, queryFromHash } from '../search/index.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

async function openStore() {
  const store = createStore({ adapter: memoryAdapter(), emitter: emit });
  await store.open();
  await store.createCompany({ name: 'Alfa s. r. o.', legalForm: 'SRO', taxpayerType: 'PO', vatMode: 'PAYER', accountingMode: 'NONE' });
  return store;
}

const invoice = (over = {}) => ({
  kind: 'INVOICE', status: 'ISSUED', number: 'FA2026001', vs: '2026001', currency: 'EUR', issueDate: '2026-10-01', dueDate: '2026-10-15',
  buyer: { name: 'Beta a.s.' }, lines: [], totals: { net: '100.00', vat: '23.00', gross: '123.00', payable: '123.00' }, payments: [], ...over
});

beforeEach(() => {
  localStorage.clear();
  resetPrefsCache();
  resetSearchCache();
  document.body.innerHTML = '';
  window.location.hash = '';
});

describe('reports screen', () => {
  it('draws every tab from the demo data', () => {
    setPref('demo', true);
    setPref('reportsPeriod', { preset: 'all', granularity: 'quarter' });
    const root = document.createElement('main');
    document.body.append(root);
    renderReports(root);
    expect(root.querySelector('h1').textContent).toBeTruthy();
    expect(root.querySelector('.badge-demo')).not.toBeNull();
    const tabs = Array.from(root.querySelectorAll('[role="tab"]'));
    expect(tabs).toHaveLength(REPORT_TABS.length);
    tabs.forEach(tab => tab.click());
    const panels = Array.from(root.querySelectorAll('[role="tabpanel"]'));
    panels.forEach(panel => expect(panel.querySelector('.report-cards')).not.toBeNull());
    expect(root.querySelectorAll('svg.chart-svg').length).toBeGreaterThanOrEqual(2);
    expect(root.querySelector('.report-table tbody tr')).not.toBeNull();
  });

  it('says what to do when there is no company', () => {
    createStore({ adapter: memoryAdapter(), emitter: emit });
    const root = document.createElement('main');
    renderReports(root);
    expect(root.querySelector('.empty-state')).not.toBeNull();
  });
});

describe('report helpers', () => {
  it('scales the axis to round steps', () => {
    expect(niceScale(0, 870)).toEqual({ top: 1000, bottom: 0, step: 250 });
    expect(niceScale(-120, 300).bottom).toBeLessThan(0);
  });

  it('draws bars and a line with a legend', () => {
    const fig = barChart({ title: 'T', labels: ['a', 'b'], series: [{ name: 'x', values: ['10', '-5'], cls: 'series-1' }, { name: 'y', values: ['3', '4'], kind: 'line', cls: 'series-2' }], format: String });
    expect(fig.querySelectorAll('rect.chart-bar')).toHaveLength(2);
    expect(fig.querySelector('polyline')).not.toBeNull();
    expect(fig.querySelectorAll('.chart-legend li')).toHaveLength(2);
  });

  it('writes CSV with a byte order mark and safe file names', () => {
    expect(csvText([{ label: 'A', value: r => r.a }], [{ a: 'x' }]).charCodeAt(0)).toBe(0xfeff);
    expect(safeFileName('predaj 2026/01: "Q1"')).toBe('predaj-2026-01-Q1-');
  });

  it('resolves periods and formats period keys and changes', () => {
    expect(resolvePeriod({ preset: 'thisYear' }, '2026-10-18')).toMatchObject({ from: '2026-01-01', to: '2026-12-31' });
    expect(resolvePeriod({ preset: 'custom', from: '2026-02-01', to: null })).toMatchObject({ from: '2026-02-01', to: null });
    expect(periodLabel('2026-Q3')).toContain('3');
    expect(periodLabel('2026')).toBe('2026');
    expect(changeText(null)).toBe('');
    expect(changeText('12.5')).toContain('12');
  });
});

describe('search', () => {
  it('fills the search dialog of the shell and opens a hit with Enter', async () => {
    const store = await openStore();
    const doc = await store.insert('documents', invoice());
    const input = document.createElement('input');
    const results = document.createElement('div');
    const box = document.createElement('div');
    box.className = 'search-box';
    box.append(input, results);
    document.body.append(box);
    handlePaletteQuery({ query: '2026001', results });
    const hit = results.querySelector('.search-hit-button');
    expect(hit.dataset.route).toBe(`invoices/${doc.id}`);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(window.location.hash).toBe(`#/invoices/${doc.id}`);
  });

  it('says when nothing is found', async () => {
    await openStore();
    const results = document.createElement('div');
    handlePaletteQuery({ query: 'zzz', results });
    expect(results.querySelector('.search-none')).not.toBeNull();
    expect(searchRoute(' a b ')).toBe('search?q=a%20b');
  });

  it('reads the query of the search screen from the address', async () => {
    const store = await openStore();
    await store.insert('contacts', { kind: 'COMPANY', name: 'Žilinská pekáreň' });
    expect(queryFromHash('#/search?q=zilinska')).toBe('zilinska');
    window.location.hash = '#/search?q=zilinska';
    const root = document.createElement('main');
    renderSearch(root);
    expect(root.querySelector('.search-hit-title').textContent).toBe('Žilinská pekáreň');
    root.querySelector('[data-type="item"]').click();
    expect(root.querySelector('.search-hit-title')).toBeNull();
  });
});

describe('recycle bin and change log screens', () => {
  it('lists a deleted contact and restores it', async () => {
    const store = await openStore();
    const contact = await store.insert('contacts', { kind: 'COMPANY', name: 'Gama' });
    await store.remove('contacts', contact.id);
    const root = document.createElement('main');
    document.body.append(root);
    renderTrash(root);
    const row = root.querySelector(`.trash-row[data-id="${contact.id}"]`);
    expect(row.querySelector('.trash-purge')).not.toBeNull();
    row.querySelector('.trash-restore').click();
    await tick();
    await tick();
    expect(store.get('contacts', contact.id)).not.toBeNull();
    expect(root.querySelector('.trash-row')).toBeNull();
  });

  it('shows the history of one record', async () => {
    const store = await openStore();
    await store.insert('auditLog', { at: '2026-10-18T08:00:00.000Z', action: 'ISSUE', entity: 'Document', entityId: 'd1', changes: [{ field: 'status', from: 'DRAFT', to: 'ISSUED' }] });
    await store.insert('auditLog', { at: '2026-10-18T09:00:00.000Z', action: 'UPDATE', entity: 'Contact', entityId: 'c1', changes: [{ field: 'name' }] });
    expect(entityIdFromHash('#/audit/d1')).toBe('d1');
    expect(entityIdFromHash('#/audit')).toBeNull();
    window.location.hash = '#/audit/d1';
    const root = document.createElement('main');
    renderAudit(root);
    const rows = root.querySelectorAll('.report-table tbody tr');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('DRAFT');
    expect(describeChange({ field: 'lines' })).not.toBe('lines');
    expect(describeChange({ field: 'someNewField' })).toBe('someNewField');
  });
});
