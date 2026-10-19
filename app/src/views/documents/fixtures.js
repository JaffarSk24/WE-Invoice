// Test fixtures of the sales screens: a VAT payer company, a client and a
// memory store holding them. Used by the unit tests only; nothing in the
// app imports this file.
import { Store } from '../../store/store.js';
import { memoryAdapter } from '../../store/local.js';

export const COMPANY = Object.freeze({
  name: 'Alfa s. r. o.', legalForm: 'SRO', taxpayerType: 'PO', vatMode: 'PAYER', accountingMode: 'NONE',
  ico: '12345679', dic: '2020000004', icDph: 'SK2020000004', registerEntry: 'OR OS Bratislava I, oddiel Sro, vlozka 1/B',
  address: { street: 'Hlavna 1', city: 'Bratislava', zip: '811 01', country: 'SK' },
  bankAccounts: [{ id: 'bank-1', name: 'Main', iban: 'SK3112000000198742637541', bic: 'UNCRSKBX', currency: 'EUR', isDefault: true }],
  defaults: { dueDays: 14, currency: 'EUR', language: 'sk', secondLanguage: null, template: 'CLASSIC', paymentMethod: 'TRANSFER', roundingCash: false, texts: { intro: null, outro: null } },
  series: []
});

export const CONTACT = Object.freeze({
  kind: 'COMPANY', name: 'Beta a. s.', ico: '35757442', dic: '2021234567', icDph: 'SK2021234567', country: 'SK',
  billingAddress: { street: 'Dlha 5', city: 'Kosice', zip: '040 01', country: 'SK' },
  emails: [{ address: 'uctaren@beta.example', purposes: ['INVOICE'] }], dueDays: 30, language: 'en'
});

export async function memoryStore({ company = COMPANY } = {}) {
  let tick = 0;
  const events = [];
  const store = new Store({
    adapter: memoryAdapter(), emit: (name, payload) => events.push({ name, payload }),
    now: () => new Date(Date.UTC(2026, 9, 18, 9, 0, tick++)).toISOString()
  });
  await store.open();
  await store.createCompany(structuredClone(company));
  return { store, events };
}
