// @vitest-environment happy-dom
// The screen in demo mode: the tabs, the export of the sample data to a
// ZIP (saved, nothing marked), the import preview of a CSV, the Settings
// section and the start-up registration.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readZip } from '@we-invoice/core';
import { setPref, resetPrefsCache } from '../../prefs.js';
import { renderExim, tabFromHash, TABS } from './index.js';
import { renderImportPanel } from './import-panel.js';
import { periodStats } from './export-panel.js';
import { demoData } from '../shell/demo-mode.js';
import { boot } from '../../boot/exim.js';
import { settingsRenderer, resetSettingsRegistry } from '../settings/registry.js';

const fakePdf = {
  buildPdf: async (doc) => ({ arrayBuffer: async () => new TextEncoder().encode(`%PDF ${doc.number}`).buffer }),
  pdfFileNameFor: (doc) => `${doc.number}.pdf`
};
const flush = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => {
  localStorage.clear();
  resetPrefsCache();
  setPref('demo', true);
  document.body.innerHTML = '';
  window.location.hash = '#/exim';
});

describe('export and import screen', () => {
  it('opens the tab named in the address', () => {
    expect(tabFromHash('#/exim/backup')).toBe('backup');
    expect(tabFromHash('#/exim/nonsense')).toBe('export');
    expect(TABS).toEqual(['export', 'import', 'tracker', 'backup']);
  });

  it('shows the tabs and counts the documents of the period', () => {
    const root = document.createElement('div');
    renderExim(root, {});
    expect(root.querySelectorAll('[role="tab"]')).toHaveLength(4);
    expect(root.querySelector('h1').textContent).toBeTruthy();
    expect(root.querySelector('#exim-export-info').textContent).toMatch(/\d/);
  });

  it('saves the ZIP of the sample data and marks nothing', async () => {
    const saveAs = vi.fn(async () => true);
    const root = document.createElement('div');
    document.body.append(root);
    renderExim(root, { ...fakePdf, transport: { files: { saveAs } } });
    root.querySelector('#exim-export-period').value = 'thisYear';
    root.querySelector('#exim-export-period').dispatchEvent(new Event('change'));
    const button = root.querySelector('#exim-export-zip');
    expect(button.disabled).toBe(false);
    expect(root.querySelector('#exim-export-mark').disabled).toBe(true);
    button.click();
    await vi.waitFor(() => expect(saveAs).toHaveBeenCalled());
    const [name, blob] = saveAs.mock.calls[0];
    expect(name).toMatch(/\.zip$/);
    const files = await readZip(new Uint8Array(await blob.arrayBuffer()));
    expect([...files.keys()].some(n => n.startsWith('pdf/'))).toBe(true);
  });

  it('counts exported and changed documents', () => {
    const docs = [{ id: 'a', kind: 'INVOICE', status: 'ISSUED', issueDate: '2026-09-02', exportedAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-05T00:00:00.000Z', lines: [] }];
    expect(periodStats(docs, { from: '2026-09-01', to: '2026-09-30' })).toEqual({ count: 1, exported: 0, changed: 1 });
    expect(demoData().documents.length).toBeGreaterThan(0);
  });

  it('previews an import and keeps the button off in demo mode', async () => {
    const csv = 'Názov;IČO;Mesto\nNový klient;12345679;Nitra\n';
    const file = new File([csv], 'kontakty.csv', { type: 'text/csv' });
    const panel = document.createElement('div');
    renderImportPanel(panel, { transport: { files: { openFile: async () => [file] } } });
    panel.querySelector('#exim-import-program').value = 'csv';
    panel.querySelector('#exim-import-program').dispatchEvent(new Event('change'));
    panel.querySelector('#exim-import-choose').click();
    await vi.waitFor(() => expect(panel.querySelector('#exim-import-counts')).not.toBeNull());
    expect(panel.querySelector('#exim-import-counts').textContent).toMatch(/1/);
    expect(panel.querySelector('#exim-import-apply').disabled).toBe(true);
    expect(panel.querySelector('.exim-map select')).not.toBeNull();
  });
});

describe('start-up', () => {
  it('registers the route and the Settings section', async () => {
    resetSettingsRegistry();
    const routes = new Map();
    await boot({ registerRoute: (name, fn) => routes.set(name, fn), transport: {}, showError: vi.fn() });
    expect(routes.has('exim')).toBe(true);
    const section = settingsRenderer('exim');
    expect(section).toBeTypeOf('function');
    const root = document.createElement('div');
    await section(root, { redraw: () => {} });
    await flush();
    expect(root.querySelector('#settings-exim-export')).not.toBeNull();
    expect(root.querySelector('#exim-backup-save').disabled).toBe(true);
  });
});
