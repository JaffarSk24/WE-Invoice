// A busy company for the layout checks: long names, every document kind of
// the menu, a recurring template, a cash book, a warehouse with moves, a
// fixed asset and several contacts, so the screens show full tables and
// cards instead of empty states.
import { company, contact, item, invoice, NOW } from './seed.js';

const LONG = 'Severoslovenská stavebná a obchodná spoločnosť Horná Orava, s. r. o.';

export const LAYOUT_CONTACTS = [
  contact(),
  contact({
    id: 'e2e-contact-2', name: LONG, ico: '36070947', dic: '2020000015', icDph: 'SK2020000015',
    billingAddress: { street: 'Hviezdoslavovo námestie 1234/56', city: 'Dolný Kubín', zip: '026 01', country: 'SK' },
    emails: [{ address: 'fakturacia.uctovne.oddelenie@horna-orava-stavby.example', purposes: ['INVOICE'] }], dueDays: 30, note: 'Dlhodobý odberateľ.'
  }),
  contact({ id: 'e2e-contact-3', kind: 'PERSON', name: 'Ján Novák', ico: null, dic: null, icDph: null, billingAddress: { street: 'Krátka 2', city: 'Nitra', zip: '949 01', country: 'SK' } })
];

export const LAYOUT_ITEMS = [
  item(),
  item({ id: 'e2e-item-2', name: 'Montáž sadrokartónových priečok vrátane materiálu a dopravy', code: 'MSP-2026-LONG', unit: { code: 'MTK', label: 'm²' }, price: '1234.56', stockTracked: true }),
  item({ id: 'e2e-item-3', name: 'Konzultácie', code: 'KON', unit: { code: 'HUR', label: 'hod.' }, price: '50.00' })
];

const WAREHOUSE = { id: 'e2e-wh', createdAt: NOW, updatedAt: NOW, name: 'Hlavný sklad Dolný Kubín', code: 'HS', isDefault: true };
const MOVES = [
  { id: 'e2e-move-1', createdAt: NOW, updatedAt: NOW, kind: 'RECEIPT', date: '2026-10-01', warehouseId: WAREHOUSE.id, targetWarehouseId: null, itemId: 'e2e-item-2', qty: '40', unitCost: '800.00', docId: null, note: 'Prvý príjem' },
  { id: 'e2e-move-2', createdAt: NOW, updatedAt: NOW, kind: 'ISSUE', date: '2026-10-05', warehouseId: WAREHOUSE.id, targetWarehouseId: null, itemId: 'e2e-item-2', qty: '5', unitCost: '800.00', docId: null, note: null }
];

const BOOK = { id: 'e2e-cash-1', createdAt: NOW, updatedAt: NOW, name: 'Hlavná pokladnica', currency: 'EUR', openingBalance: '1000', allowNegative: false, seriesInId: null, seriesOutId: null, kind: 'CASH' };

const ASSET = {
  id: 'e2e-asset-1', createdAt: NOW, updatedAt: NOW, name: 'Osobný automobil Škoda Octavia Combi', inventoryNumber: 'M-2026-001', kind: 'TANGIBLE',
  acquiredOn: '2026-02-10', inUseFrom: '2026-02-10', cost: '24500.00', depreciationGroup: 1, method: 'STRAIGHT', disposedOn: null, docId: null, plan: []
};

const LEVEL = { id: 'e2e-level-vo', createdAt: NOW, updatedAt: NOW, name: 'Veľkoobchod', discountPct: '10' };

function doc(kind, number, extra = {}) {
  return invoice({ kind, number, id: `e2e-doc-${number}`, ...extra });
}

export function layoutDocuments() {
  const long = LAYOUT_CONTACTS[1];
  return [
    doc('INVOICE', 'FA20260001'),
    doc('INVOICE', 'FA20260002', { contact: long, status: 'PAID', issueDate: '2026-09-02', taxDate: '2026-09-02', dueDate: '2026-09-16',
      payments: [{ id: 'p1', date: '2026-09-10', amount: '615.00', method: 'TRANSFER', source: 'MANUAL', note: null }] }),
    doc('INVOICE', 'FA20260003', { contact: long, issueDate: '2026-08-01', taxDate: '2026-08-01', dueDate: '2026-08-15' }),
    doc('INVOICE', 'FA20260004', { status: 'DRAFT', number: null, id: 'e2e-doc-draft' }),
    doc('PROFORMA', 'ZF20260001', { contact: long }),
    doc('CREDIT_NOTE', 'DB20260001'),
    doc('QUOTE', 'CP20260001', { contact: long }),
    doc('ORDER_IN', 'OBJ20260001'),
    doc('DELIVERY_NOTE', 'DL20260001', { contact: long }),
    doc('RECEIVED_INVOICE', 'PF20260001', { contact: long, status: 'ISSUED' }),
    doc('EXPENSE_RECEIPT', 'VY20260001', { status: 'PAID' })
  ];
}

export function layoutRecurring() {
  return [{
    id: 'e2e-rec-1', createdAt: NOW, updatedAt: NOW, name: 'Mesačný servis a údržba informačného systému', frequency: 'MONTH', interval: 1,
    firstRun: '2026-01-05', nextRun: '2026-11-05', endDate: null, maxCount: null, generatedCount: 9, dueShiftDays: 14, taxDateAtPeriodEnd: false,
    autoSend: false, sendVia: [], emailTo: [], copyToSelf: false, periodText: null, active: true, contactId: 'e2e-contact-2',
    docTemplate: { kind: 'INVOICE', contactId: 'e2e-contact-2', currency: 'EUR', lines: invoice().lines }, history: []
  }];
}

/** The data file of the busy company for seed(). */
export function layoutFile(overrides = {}) {
  return {
    company: company({ name: 'Biela Orlica, obchodná a stavebná spoločnosť s.r.o.', ...overrides }),
    contacts: LAYOUT_CONTACTS,
    items: LAYOUT_ITEMS,
    priceLevels: [LEVEL],
    documents: layoutDocuments(),
    recurringTemplates: layoutRecurring(),
    cashBooks: [BOOK],
    warehouses: [WAREHOUSE],
    stockMoves: MOVES,
    assets: [ASSET]
  };
}
