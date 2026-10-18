// @vitest-environment happy-dom
// The store and the shell: the wizard's company lands in the store, an old
// device copy moves in once, switching and changes reach the shell.
import { describe, it, expect, beforeEach } from 'vitest';
import { Store, memoryAdapter } from './index.js';
import { connectStore, adoptLocalCompany } from './bridge.js';
import { saveLocalCompany, loadLocalCompany } from '../views/onboarding/state.js';
import { setPref } from '../prefs.js';

function bus() {
  const handlers = new Map();
  const sent = [];
  const emit = (name, payload) => {
    sent.push({ name, payload });
    (handlers.get(name) || []).forEach(fn => fn(payload));
  };
  const on = (name, fn) => handlers.set(name, [...(handlers.get(name) || []), fn]);
  return { on, emit, sent };
}

const flush = () => new Promise(r => setTimeout(r, 0));
const wizardCompany = (over = {}) => ({ id: '01923456-7890-7abc-8def-0123456789ab', name: 'Firma s. r. o.', defaults: { language: 'sk' }, ...over });

async function setup() {
  const events = bus();
  const store = new Store({ adapter: memoryAdapter(), emit: events.emit });
  await store.open();
  const errors = [];
  connectStore(store, { on: events.on, emit: events.emit, showError: (e) => errors.push(e) });
  return { store, events, errors };
}

beforeEach(() => {
  localStorage.clear();
  setPref('demo', false);
});

describe('store bridge', () => {
  it('puts the wizard company into the store and then drops the device copy', async () => {
    const { store, events } = await setup();
    const company = wizardCompany();
    saveLocalCompany(company);
    events.emit('onboarding:complete', { company });
    await flush();
    expect(store.company()).toMatchObject({ id: company.id, name: 'Firma s. r. o.' });
    expect(store.companies().map(c => c.id)).toEqual([company.id]);
    expect(loadLocalCompany()).toBe(null);
    const switched = events.sent.filter(e => e.name === 'company:switched').pop();
    expect(switched.payload.company.id).toBe(company.id);
  });

  it('moves a device copy into the store once and ignores one it already has', async () => {
    const { store } = await setup();
    saveLocalCompany(wizardCompany());
    await adoptLocalCompany(store);
    expect(store.companies()).toHaveLength(1);
    saveLocalCompany(wizardCompany({ name: 'Old copy' }));
    expect(await adoptLocalCompany(store)).toBe(null);
    expect(store.companies()).toHaveLength(1);
    expect(store.company().name).toBe('Firma s. r. o.');
    expect(loadLocalCompany()).toBe(null);
  });

  it('keeps the device copy when the store cannot write', async () => {
    const { store, events, errors } = await setup();
    store.readOnly = true;
    saveLocalCompany(wizardCompany());
    events.emit('onboarding:complete', { company: wizardCompany() });
    await flush();
    expect(store.companies()).toEqual([]);
    expect(loadLocalCompany().name).toBe('Firma s. r. o.');
    expect(errors).toEqual([]);
  });

  it('switches through the store and announces a changed company', async () => {
    const { store, events, errors } = await setup();
    const a = await store.createCompany({ name: 'A' });
    await store.createCompany({ name: 'B' });
    events.emit('company:switch', { id: a.id });
    await flush();
    expect(store.company().name).toBe('A');
    events.sent.length = 0;
    await store.updateCompany({ name: 'A2' });
    const switched = events.sent.filter(e => e.name === 'company:switched');
    expect(switched.pop().payload.company.name).toBe('A2');
    events.emit('company:switch', { id: 'missing' });
    await flush();
    expect(errors[0]).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('announces the real company again when sample mode ends', async () => {
    const { store, events } = await setup();
    await store.createCompany({ name: 'Real' });
    events.sent.length = 0;
    events.emit('demo:disabled');
    expect(events.sent.find(e => e.name === 'company:switched').payload.company.name).toBe('Real');
  });
});
