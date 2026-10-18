// A month of a Slovak VAT payer with synthetic identifiers (valid
// checksums, no real company): issued invoices at 23 % and 5 %, a credit
// note, an invoice in CZK with reverse charge, a received invoice, a
// receipt, a draft that must never be exported and a document of the
// next month.
const T = '2026-09-01T08:00:00.000Z';
const base = (id) => ({ id, createdAt: T, updatedAt: T, deleted: false });

export const company = {
  ...base('0192f0a0-0000-7000-8000-000000000001'),
  name: 'Biela Hora s. r. o.', legalForm: 'SRO', ico: '12345679', dic: '2020000004', icDph: 'SK2020000004', vatMode: 'PAYER',
  address: { street: 'Hlavná 12', city: 'Bratislava', zip: '811 01', country: 'SK' },
  bankAccounts: [{ id: 'acc-1', name: 'Hlavný účet', iban: 'SK3112000000198742637541', bic: 'UNCRSKBX', currency: 'EUR', isDefault: true }]
};

const seller = {
  name: company.name, ico: company.ico, dic: company.dic, icDph: company.icDph, address: company.address, vatPayer: true,
  email: 'fakturacia@example.sk', phone: '+421 900 000 000'
};
const buyer = {
  contactId: 'c-1', name: 'Odberateľ, a. s.', ico: '35757442', dic: '2021000011', icDph: 'SK2021000011', vatPayer: true,
  address: { street: 'Mlynská 5', city: 'Košice', zip: '040 01', country: 'SK' }
};
const czBuyer = {
  contactId: 'c-2', name: 'Česká firma s.r.o.', ico: '27082440', dic: 'CZ27082440', icDph: 'CZ27082440', vatPayer: true,
  address: { street: 'Na Příkopě 10', city: 'Praha', zip: '110 00', country: 'CZ' }
};
const supplier = {
  contactId: 'c-3', name: 'Dodávateľ, s. r. o.', ico: '44556677', dic: '2022000018', icDph: 'SK2022000018', vatPayer: true,
  address: { street: 'Štúrova 1', city: 'Žilina', zip: '010 01', country: 'SK' }
};

const line = (id, name, qty, unitPrice, vatRate, extra = {}) => ({
  id, kind: 'ITEM', name, qty, unit: { code: 'C62', label: 'ks' }, unitPrice, priceType: 'NET', discountPct: null,
  vatRate, vatCategory: vatRate === null ? 'O' : 'S', ...extra
});

export const documents = [
  {
    ...base('0192f0a0-0000-7000-8000-000000000101'), kind: 'INVOICE', number: 'FA2026001', vs: '2026001', ks: '0308', status: 'PAID',
    issueDate: '2026-09-02', taxDate: '2026-09-01', dueDate: '2026-09-16', currency: 'EUR', seller, buyer, contactId: 'c-1',
    paymentMethod: 'TRANSFER', bankAccountId: 'acc-1', language: 'sk', textIntro: 'Fakturujeme Vám za september',
    lines: [line('l1', 'Konzultácie', '10', '50.00', '23', { unit: { code: 'HUR', label: 'hod' } }), line('l2', 'Kniha "Účtovníctvo"', '2', '20.00', '5', { discountPct: '10' })],
    payments: [{ id: 'p1', date: '2026-09-10', amount: '651.80', currency: 'EUR', method: 'TRANSFER', source: 'BANK_IMPORT' }],
    links: []
  },
  {
    ...base('0192f0a0-0000-7000-8000-000000000102'), kind: 'CREDIT_NOTE', number: 'DB2026001', vs: '2026101', status: 'ISSUED',
    issueDate: '2026-09-20', taxDate: '2026-09-20', dueDate: '2026-10-04', currency: 'EUR', seller, buyer, contactId: 'c-1',
    paymentMethod: 'TRANSFER', correctionReason: 'Zľava', lines: [line('l1', 'Zľava na konzultácie', '1', '-50.00', '23')],
    payments: [], links: [{ kind: 'CORRECTS', docId: '0192f0a0-0000-7000-8000-000000000101' }]
  },
  {
    ...base('0192f0a0-0000-7000-8000-000000000103'), kind: 'INVOICE', number: 'FA2026002', vs: '2026002', status: 'SENT',
    issueDate: '2026-09-15', taxDate: '2026-09-15', dueDate: '2026-09-29', currency: 'CZK', fxRate: '25.120', fxRateDate: '2026-09-14',
    fxSource: 'ECB', seller, buyer: czBuyer, contactId: 'c-2', paymentMethod: 'TRANSFER',
    lines: [line('l1', 'Programovanie', '1', '25120.00', null, { vatCategory: 'AE', vatRate: null, exemptionReasonText: 'Prenesenie daňovej povinnosti' })],
    payments: [], links: []
  },
  {
    ...base('0192f0a0-0000-7000-8000-000000000104'), kind: 'RECEIVED_INVOICE', number: '2026/0815', vs: '20260815', status: 'PAID',
    issueDate: '2026-09-05', taxDate: '2026-09-04', receivedDate: '2026-09-06', dueDate: '2026-09-19', currency: 'EUR',
    seller: supplier, buyer: seller, contactId: 'c-3', paymentMethod: 'TRANSFER',
    lines: [line('l1', 'Prenájom kancelárie', '1', '400.00', '23')],
    payments: [{ id: 'p2', date: '2026-09-18', amount: '492.00', currency: 'EUR', method: 'TRANSFER', source: 'MANUAL' }], links: []
  },
  {
    ...base('0192f0a0-0000-7000-8000-000000000105'), kind: 'EXPENSE_RECEIPT', number: 'BL-77', status: 'PAID',
    issueDate: '2026-09-21', taxDate: '2026-09-21', currency: 'EUR', seller: { ...supplier, name: 'Papiernictvo' }, buyer: seller,
    paymentMethod: 'CASH', lines: [line('l1', 'Kancelársky papier', '3', '4.10', '23')],
    payments: [{ id: 'p3', date: '2026-09-21', amount: '15.13', currency: 'EUR', method: 'CASH', source: 'CASH' }], links: []
  },
  {
    ...base('0192f0a0-0000-7000-8000-000000000106'), kind: 'INVOICE', number: null, status: 'DRAFT', issueDate: '2026-09-25',
    currency: 'EUR', seller, buyer, lines: [line('l1', 'Koncept', '1', '1.00', '23')], payments: [], links: []
  },
  {
    ...base('0192f0a0-0000-7000-8000-000000000107'), kind: 'INVOICE', number: 'FA2026003', vs: '2026003', status: 'ISSUED',
    issueDate: '2026-10-01', taxDate: '2026-10-01', dueDate: '2026-10-15', currency: 'EUR', seller, buyer,
    paymentMethod: 'TRANSFER', lines: [line('l1', 'Konzultácie', '1', '50.00', '23')], payments: [], links: []
  }
];

export const contacts = [
  { ...base('c-1'), kind: 'COMPANY', name: buyer.name, ico: buyer.ico, dic: buyer.dic, icDph: buyer.icDph, country: 'SK', billingAddress: buyer.address, emails: [{ address: 'uctaren@example.sk' }], dueDays: 14 },
  { ...base('c-2'), kind: 'COMPANY', name: czBuyer.name, ico: czBuyer.ico, dic: czBuyer.dic, icDph: czBuyer.icDph, country: 'CZ', billingAddress: czBuyer.address, emails: [] },
  { ...base('c-3'), kind: 'COMPANY', name: supplier.name, ico: supplier.ico, dic: supplier.dic, icDph: supplier.icDph, country: 'SK', billingAddress: supplier.address, emails: [] }
];

export const period = { from: '2026-09-01', to: '2026-09-30' };
