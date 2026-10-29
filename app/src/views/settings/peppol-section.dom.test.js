// @vitest-environment happy-dom
// The eFaktúra wizard in a DOM, against the real store and an in-memory
// provider behind the gateway: provider, keys with a connection test,
// Peppol registration, options, disconnect. No invite code: eFaktúra is
// open to everyone.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createStore, memoryAdapter } from '../../store/index.js';
import { applySwitched } from '../shell/company-state.js';
import { resetPrefsCache } from '../../prefs.js';
import { createSapiProvider, createMockTransport, mockResponse } from '../../peppol/mock-provider.js';
import { dropAllTokens } from '../../peppol/token-cache.js';
import { secretName } from '../../peppol/credentials.js';
import { createPeppolSection } from './peppol-section.js';

const COMPANY = {
  name: 'Alfa s.r.o.', legalForm: 'SRO', taxpayerType: 'PO', vatMode: 'PAYER', accountingMode: 'NONE',
  ico: '35000007', dic: '2020000004', icDph: 'SK2020000004', address: { country: 'SK' }
};

function gateway({ url }) {
  if (url.endsWith('/v1/peppol/lookup/0245/2020000004')) return mockResponse(200, { registered: true, documentTypes: [], checkedAt: '2027-01-02T10:00:00Z' });
  return mockResponse(404, {});
}

async function setup({ company = COMPANY } = {}) {
  document.body.innerHTML = '';
  localStorage.clear();
  resetPrefsCache();
  dropAllTokens();
  const store = createStore({ adapter: memoryAdapter(), emitter: (name, payload) => { if (name === 'company:switched') applySwitched(payload); } });
  await store.open();
  const created = await store.createCompany(company);
  applySwitched({ company: created, companies: [created] });
  const server = createSapiProvider();
  const transport = createMockTransport({ providers: { verteco: server }, gateway });
  const root = document.createElement('div');
  document.body.append(root);
  const redraw = vi.fn(() => { root.replaceChildren(); createPeppolSection({ transport })(root, { redraw }); });
  createPeppolSection({ transport })(root, { redraw });
  return { store, server, transport, root, redraw };
}

const click = (el) => el.dispatchEvent(new Event('click', { bubbles: true }));
const type = (el, value) => { el.value = value; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); };

describe('eFaktúra settings wizard', () => {
  beforeEach(() => { applySwitched(null); });

  it('shows every step with the provider cards from providers.json', async () => {
    const { root } = await setup();
    const steps = [...root.querySelectorAll('.peppol-step')].map(s => s.dataset.step);
    expect(steps).toEqual(['intro', 'provider', 'vpds', 'connect', 'lookup', 'options']);
    expect(root.querySelector('#peppol-beta-code')).toBeNull();
    const verteco = root.querySelector('[data-provider="verteco"] input');
    expect(verteco.checked).toBe(true);
    expect(root.querySelector('[data-provider="ipostar"] input').disabled).toBe(true);
    expect(root.querySelector('.peppol-custom-base').hidden).toBe(true);
    click(root.querySelector('[data-provider="sapi-sk"] input'));
    root.querySelector('[data-provider="sapi-sk"] input').dispatchEvent(new Event('change'));
    expect(root.querySelector('.peppol-custom-base').hidden).toBe(false);
  });

  it('tests the connection, then stores the key in secrets and the settings in the company', async () => {
    const { root, store, transport, server } = await setup();
    type(root.querySelector('#peppol-cred-clientId'), 'client');
    type(root.querySelector('#peppol-cred-clientSecret'), 'wrong');
    click(root.querySelector('[data-action="test-connection"]'));
    await vi.waitFor(() => expect(root.querySelector('[data-step="connect"] .peppol-result').className).toContain('is-error'));
    expect(transport.secretsMap.size).toBe(0);
    type(root.querySelector('#peppol-cred-clientSecret'), 'secret');
    click(root.querySelector('[data-action="test-connection"]'));
    await vi.waitFor(() => expect(store.company().peppol?.enabled).toBe(true));
    expect(store.company().peppol).toMatchObject({ providerId: 'verteco', participantId: '0245:2020000004', sandbox: false });
    expect(JSON.stringify(store.company())).not.toContain('secret"');
    expect(JSON.parse(transport.secretsMap.get(secretName(store.company().id, 'verteco')))).toEqual({ clientId: 'client', clientSecret: 'secret' });
    expect(server.state.tokens).toBeGreaterThan(0);
    expect(root.querySelector('#peppol-cred-clientSecret').value).toBe('');
  });

  it('checks the Peppol registration and saves the options', async () => {
    const { root, store } = await setup();
    click(root.querySelector('[data-action="lookup"]'));
    await vi.waitFor(() => expect(root.querySelector('[data-step="lookup"] .peppol-result').className).toContain('is-ok'));
    await vi.waitFor(() => expect(store.company().peppol?.registered).toBe(true));
    const attach = root.querySelector('#peppol-attach-pdf');
    expect(attach.checked).toBe(true);
    attach.checked = false;
    attach.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(store.company().defaults?.attachPdfToEInvoice).toBe(false));
    const auto = root.querySelector('#peppol-auto-receive');
    auto.checked = false;
    auto.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(store.company().peppol?.autoReceive).toBe(false));
  });

  it('asks for a DIČ before anything else', async () => {
    const { root } = await setup({ company: { ...COMPANY, dic: null } });
    expect(root.querySelector('[data-step="provider"]')).toBeNull();
    expect(root.querySelector('.callout-warning')).not.toBeNull();
  });
});
