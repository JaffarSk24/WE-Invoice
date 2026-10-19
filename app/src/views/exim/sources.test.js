// @vitest-environment happy-dom
// New import sources in the app: old Excel files, Shoptet orders and the
// SuperFaktúra API (direct on the desktop, the gateway in the browser when
// the API refuses a cross-origin request, errors, paging and progress),
// and the credentials kept in transport.secrets.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readSourceFile, parseSources } from './import-read.js';
import { createSfClient, fetchSuperfaktura } from './sf-client.js';
import { renderSfPanel, secretName } from './sf-panel.js';
import { company } from '../../../../tests/fixtures/exports/period.js';

// happy-dom gives import.meta.url an http base, so fixtures are found from the repository root.
const fixture = (name) => readFileSync(resolve('tests/fixtures/imports', name));
const sfJson = (name) => JSON.parse(fixture(`superfaktura-api/${name}`).toString('utf8'));
const answer = (status, body, headers = {}) => ({ status, ok: status >= 200 && status < 300, headers, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });

// A fake API: list pages and details by path.
function apiAnswers(path) {
  if (path.startsWith('/clients/index.json/') && path.includes('page:1/')) return answer(200, sfJson('clients-page-1.json'));
  if (path.startsWith('/clients/index.json/')) return answer(200, sfJson('clients-page-2.json'));
  if (path.startsWith('/stock_items/')) return answer(200, sfJson('stock-items.json'));
  if (path.startsWith('/invoices/index.json/')) return answer(200, sfJson('invoices-page-1.json'));
  if (path.startsWith('/invoices/getInvoiceDetails/')) return answer(200, sfJson('invoice-details.json'));
  return answer(404, { error: 1, error_message: 'not found' });
}

describe('reading files', () => {
  it('reads an old Excel file as rows for the KROS importer', async () => {
    const file = new File([fixture('kros-adresar.xls')], 'adresar.xls');
    const source = await readSourceFile(file);
    expect(source.rows[1][0]).toBe('Dodávateľ, s. r. o.');
    const parsed = parseSources('kros', [source], { company, direction: 'OUT' });
    expect(parsed.contacts).toHaveLength(2);
    expect(parsed.tables[0].entity).toBe('contacts');
  });

  it('reads Shoptet orders from XML and CSV into drafts or received orders', async () => {
    const xml = await readSourceFile(new File([fixture('shoptet/orders.xml')], 'orders.xml'));
    const csv = await readSourceFile(new File([fixture('shoptet/orders.csv')], 'orders.csv'));
    const drafts = parseSources('shoptet', [xml, csv], { company, target: 'INVOICE_DRAFT', addItems: true });
    expect(drafts.documents.map(d => [d.orderReference, d.status])).toEqual([['2026000101', 'DRAFT'], ['2026000102', 'DRAFT'], ['2026000104', 'DRAFT'], ['2026000201', 'DRAFT']]);
    expect(drafts.report.skipped.map(s => s.reason)).toEqual(['ORDER_CANCELLED', 'ORDER_CANCELLED']);
    const orders = parseSources('shoptet', [xml], { company, target: 'ORDER_IN', addItems: false });
    expect(orders.documents[0]).toMatchObject({ kind: 'ORDER_IN', number: '2026000101' });
    expect(orders.items).toEqual([]);
  });
});

describe('SuperFaktúra API client', () => {
  it('pages through clients, items and invoices with progress, directly on the desktop', async () => {
    const calls = [];
    const transport = { platform: 'mac', http: async ({ url, headers }) => { calls.push({ url, auth: headers.authorization }); return apiAnswers(url.replace('https://moja.superfaktura.sk', '')); } };
    const progress = [];
    const client = createSfClient({ transport, auth: 'SFAPI email=a' });
    const out = await fetchSuperfaktura(client, { onProgress: (p) => progress.push(`${p.stage} ${p.done}/${p.total}`) });
    expect(out.clients).toHaveLength(3);
    expect(out.items).toHaveLength(2);
    expect(out.invoices.map(i => i.Invoice.id)).toEqual(['501', '502', '503']);
    expect(progress).toEqual(['clients 1/2', 'clients 2/2', 'items 1/1', 'invoices 1/1', 'details 3/3']);
    expect(calls[0]).toEqual({ url: 'https://moja.superfaktura.sk/clients/index.json/listinfo:1/page:1/per_page:100', auth: 'SFAPI email=a' });
    expect(client.usesGateway()).toBe(false);
  });

  it('switches to the gateway proxy when the browser refuses the direct request', async () => {
    const urls = [];
    const transport = {
      platform: 'web', gatewayUrl: (p) => `https://gw.example${p}`,
      http: async ({ url, headers }) => {
        urls.push(url);
        if (url.startsWith('https://moja.')) throw new TypeError('Failed to fetch');
        expect(headers['x-upstream-authorization']).toBe('SFAPI x');
        expect(headers.authorization).toBeUndefined();
        return apiAnswers(url.replace('https://gw.example/v1/proxy/superfaktura/sk', ''));
      }
    };
    const client = createSfClient({ transport, auth: 'SFAPI x' });
    const out = await fetchSuperfaktura(client, { lists: ['items'] });
    expect(out.items).toHaveLength(2);
    expect(urls).toEqual(['https://moja.superfaktura.sk/stock_items/index.json/listinfo:1/page:1/per_page:100', 'https://gw.example/v1/proxy/superfaktura/sk/stock_items/index.json/listinfo:1/page:1/per_page:100']);
    expect(client.usesGateway()).toBe(true);
  });

  it('turns HTTP and API failures into error codes, retries a rate limit and can be stopped', async () => {
    const run = (http, platform = 'mac') => fetchSuperfaktura(createSfClient({ transport: { platform, http, gatewayUrl: (p) => `https://gw${p}` }, auth: 'a' }), { lists: ['items'] });
    await expect(run(async () => answer(401, ''))).rejects.toMatchObject({ code: 'SF_UNAUTHORIZED' });
    await expect(run(async () => answer(200, sfJson('error-unauthorized.json')))).rejects.toMatchObject({ code: 'SF_UNAUTHORIZED' });
    await expect(run(async () => answer(502, ''))).rejects.toMatchObject({ code: 'SF_UNAVAILABLE' });
    await expect(run(async () => answer(200, '<html>'))).rejects.toMatchObject({ code: 'SF_ANSWER_UNREADABLE' });
    await expect(run(async () => { throw new TypeError('offline'); })).rejects.toMatchObject({ code: 'SF_UNREACHABLE' });
    await expect(run(async ({ url }) => (url.startsWith('https://gw') ? answer(404, '') : Promise.reject(new TypeError('cors'))), 'web')).rejects.toMatchObject({ code: 'SF_PROXY_UNAVAILABLE' });
    let n = 0;
    vi.useFakeTimers();
    const limited = run(async (req) => (++n === 1 ? answer(429, '', { 'retry-after': '1' }) : apiAnswers(req.url.replace('https://moja.superfaktura.sk', ''))));
    await vi.advanceTimersByTimeAsync(1100);
    expect((await limited).items).toHaveLength(2);
    vi.useRealTimers();
    const signal = { aborted: true };
    await expect(fetchSuperfaktura({ get: async () => ({}) }, { signal })).rejects.toMatchObject({ code: 'SF_CANCELLED' });
  });
});

describe('SuperFaktúra form', () => {
  it('keeps the credentials in the secrets only when asked, and hands the drafts on', async () => {
    const secrets = new Map();
    const transport = { platform: 'mac', secrets: { get: async (k) => secrets.get(k) || null, set: async (k, v) => { secrets.set(k, v); return true; }, delete: async (k) => secrets.delete(k) } };
    const onParsed = vi.fn();
    const fake = { get: async (path) => JSON.parse(await apiAnswers(path).text()) };
    const root = document.createElement('div');
    renderSfPanel(root, { transport, company, onParsed, createClient: () => fake });
    root.querySelector('#exim-sf-start').click();
    await vi.waitFor(() => expect(root.querySelector('#exim-sf-status').textContent).not.toBe(''));
    expect(onParsed).not.toHaveBeenCalled();
    root.querySelector('#exim-sf-email').value = 'jana@example.sk';
    root.querySelector('#exim-sf-key').value = 'tajny-kluc';
    root.querySelector('#exim-sf-remember').checked = true;
    root.querySelector('#exim-sf-start').click();
    await vi.waitFor(() => expect(onParsed).toHaveBeenCalled());
    const parsed = onParsed.mock.calls[0][0];
    expect(parsed.documents.map(d => d.number)).toEqual(['2026001', 'D2026001', '2026002']);
    expect(JSON.parse(secrets.get(secretName(company.id)))).toEqual({ market: 'sk', email: 'jana@example.sk', apiKey: 'tajny-kluc', companyId: '' });
    const again = document.createElement('div');
    renderSfPanel(again, { transport, company, onParsed, createClient: () => fake });
    await vi.waitFor(() => expect(again.querySelector('#exim-sf-key').value).toBe('tajny-kluc'));
    again.querySelector('#exim-sf-forget').click();
    await vi.waitFor(() => expect(secrets.size).toBe(0));
  });
});
