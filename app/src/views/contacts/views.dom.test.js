// @vitest-environment happy-dom
// The CRM screens drawn over a real store in memory: the contact list,
// card and form, the price list, recurring invoices, reminders and the
// two settings sections, plus demo mode, where nothing is written.
import { describe, it, expect, beforeEach } from 'vitest';
import { createStore, memoryAdapter } from '../../store/index.js';
import { emit } from '../../events.js';
import { setPref, resetPrefsCache } from '../../prefs.js';
import { createContactsView } from './index.js';
import { createItemsView } from '../items/index.js';
import { createRecurringView } from '../recurring/index.js';
import { createRemindersView } from '../reminders/index.js';
import { emailSection } from '../settings/email-section.js';
import { remindersSection } from '../settings/reminders-section.js';

const transport = { platform: 'web', gatewayUrl: (p) => p, http: async () => { throw new Error('offline'); }, files: { saveAs: async () => true, openFile: async () => null }, notify: () => {} };
const tick = () => new Promise(r => setTimeout(r, 0));
let store;

async function freshStore() {
  store = createStore({ adapter: memoryAdapter(), emitter: emit });
  await store.open();
  await store.createCompany({ name: 'Alfa s. r. o.', legalForm: 'SRO', taxpayerType: 'PO', vatMode: 'PAYER', accountingMode: 'NONE', email: 'alfa@alfa.sk', defaults: { language: 'sk', dueDays: 14 }, series: [] });
  return store;
}

function mount(view, hash) {
  window.location.hash = hash;
  const root = document.createElement('main');
  document.body.replaceChildren(root);
  view(root);
  return root;
}

beforeEach(async () => {
  localStorage.clear();
  resetPrefsCache();
  await freshStore();
});

describe('contacts screens', () => {
  it('shows the empty list, then the contact, its card and its form', async () => {
    const view = createContactsView({ transport });
    let root = mount(view, '#/contacts');
    expect(root.querySelector('.empty-state')).not.toBe(null);
    const c = await store.insert('contacts', { kind: 'COMPANY', name: 'Beta s. r. o.', ico: '36070947', country: 'SK', billingAddress: { city: 'Košice', country: 'SK' }, emails: [{ address: 'b@beta.sk', purposes: ['INVOICE'] }] });
    await tick();
    expect(root.textContent).toContain('Beta s. r. o.');
    root = mount(view, `#/contacts/${c.id}`);
    expect(root.querySelector('#contact-title').textContent).toBe('Beta s. r. o.');
    expect(root.textContent).toContain('b@beta.sk');
    root = mount(view, `#/contacts/${c.id}/edit`);
    expect(root.querySelector('#contact-name').value).toBe('Beta s. r. o.');
    root.querySelector('#contact-name').value = '';
    root.querySelector('form').dispatchEvent(new Event('submit'));
    await tick();
    expect(root.querySelector('#contact-name').getAttribute('aria-invalid')).toBe('true');
    expect(store.get('contacts', c.id).name).toBe('Beta s. r. o.');
  });

  it('shows the demo contacts in demo mode and does not write', async () => {
    setPref('demo', true);
    const root = mount(createContactsView({ transport }), '#/contacts');
    expect(root.querySelectorAll('.data-table tr.row, .data-table .list-card').length).toBeGreaterThan(0);
    const form = mount(createContactsView({ transport }), '#/contacts/new');
    form.querySelector('#contact-name').value = 'Nový';
    form.querySelector('form').dispatchEvent(new Event('submit'));
    await tick();
    expect(store.list('contacts')).toEqual([]);
  });
});

describe('other CRM screens', () => {
  it('draws the price list and an item card', async () => {
    const view = createItemsView({ transport });
    let root = mount(view, '#/items');
    expect(root.querySelector('.empty-state')).not.toBe(null);
    const item = await store.insert('items', { name: 'Hosting', price: '10', priceType: 'NET', vatCategory: 'S', vatRate: '23', unit: { code: 'MON', label: '' }, currency: 'EUR' });
    root = mount(view, `#/items/${item.id}`);
    expect(root.querySelector('#item-name').value).toBe('Hosting');
    expect(root.querySelector('#item-price-preview').textContent).toContain('12');
  });

  it('draws the recurring list and form', async () => {
    const view = createRecurringView({ transport });
    let root = mount(view, '#/recurring');
    expect(root.querySelector('.empty-state')).not.toBe(null);
    root = mount(view, '#/recurring/new');
    expect(root.querySelector('#tpl-first-run').value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(root.querySelector('#tpl-preview').textContent).not.toBe('');
  });

  it('draws the reminders screen with an overdue invoice', async () => {
    const contact = await store.insert('contacts', { kind: 'COMPANY', name: 'Beta', emails: [{ address: 'b@beta.sk' }] });
    await store.insert('documents', {
      kind: 'INVOICE', status: 'ISSUED', number: 'FA9', currency: 'EUR', issueDate: '2020-01-01', dueDate: '2020-01-15', contactId: contact.id,
      lines: [{ id: 'l', kind: 'ITEM', name: 'x', qty: '1', unitPrice: '100', priceType: 'NET', vatCategory: 'S', vatRate: '23' }], payments: [], sendLog: []
    });
    const root = mount(createRemindersView({ transport }), '#/reminders');
    expect(root.textContent).toContain('FA9');
    expect(root.querySelector('#reminders-ecb-missing')).not.toBe(null);
  });

  it('draws and saves the reminder settings and shows the e-mail settings', async () => {
    const box = document.createElement('div');
    document.body.replaceChildren(box);
    remindersSection(box);
    box.querySelector('#reminders-ecb-rate').value = '2,15';
    box.querySelector('#reminders-ecb-rate').dispatchEvent(new Event('change'));
    box.querySelector('form').dispatchEvent(new Event('submit'));
    await tick();
    expect(store.list('reminderPolicies')[0]).toMatchObject({ ecbRatePct: '2.15', enabled: true });
    const mail = document.createElement('div');
    document.body.replaceChildren(mail);
    emailSection(mail, { win: {} });
    expect(mail.querySelectorAll('.templates-table tbody tr').length).toBe(24);
  });
});
