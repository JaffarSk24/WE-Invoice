// Demo data for "Try with sample data": one company, ten contacts and
// thirty documents spread over the last fourteen months, the same every
// time (a seeded generator), so screenshots and tests are stable. Nothing
// here syncs; the names come from the dictionaries through `names`.
import Big from 'big.js';
import { addDays, ymd } from '../../components/dates.js';

export const DEMO_COMPANY_ID = 'demo-company';

// A small deterministic generator (mulberry32).
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STATUSES = ['PAID', 'PAID', 'PAID', 'SENT', 'ISSUED', 'OVERDUE', 'PARTIALLY_PAID', 'DRAFT'];

export function demoCompany(names) {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id: DEMO_COMPANY_ID, createdAt: now, updatedAt: now, deleted: false,
    name: names.company, legalForm: 'SRO', taxpayerType: 'PO', ico: '12345678', dic: '2020000001', icDph: 'SK2020000001',
    vatMode: 'PAYER', vatPeriod: 'MONTH', cashBasis: false, oss: false, usesEkasa: false, registerEntry: null,
    address: { street: 'Hlavna 1', city: 'Bratislava', zip: '811 01', country: 'SK' },
    bankAccounts: [{ id: 'demo-bank', name: '', iban: 'SK3112000000198742637541', bic: 'UNCRSKBX', currency: 'EUR', isDefault: true }],
    accountingMode: 'NONE', demo: true, onboardedAt: now
  };
}

export function demoContacts(names) {
  return names.contacts.map((name, i) => ({
    id: `demo-contact-${i + 1}`, kind: 'COMPANY', name, ico: String(10000001 + i * 7), country: 'SK', city: names.cities[i % names.cities.length]
  }));
}

// `today` is the local calendar date the data is centred on.
export function demoDocuments(contacts, today) {
  const rnd = seeded(20260101);
  const [year, month] = today.split('-').map(Number);
  const docs = [];
  for (let i = 0; i < 30; i++) {
    const monthsBack = Math.floor(rnd() * 14);
    let y = year;
    let m = month - monthsBack;
    while (m < 1) { m += 12; y -= 1; }
    const day = 1 + Math.floor(rnd() * 27);
    const issueDate = ymd(y, m, day);
    const dueDate = addDays(issueDate, 14);
    const net = new Big((Math.floor(rnd() * 48) + 2) * 50);
    const vat = net.times('0.23').round(2, Big.roundHalfUp);
    const gross = net.plus(vat);
    const contact = contacts[Math.floor(rnd() * contacts.length)];
    const incoming = i % 5 === 4;
    let status = incoming ? 'PAID' : STATUSES[Math.floor(rnd() * STATUSES.length)];
    if (!incoming && status !== 'PAID' && status !== 'DRAFT' && dueDate < today) status = 'OVERDUE';
    if (!incoming && status === 'OVERDUE' && dueDate >= today) status = 'SENT';
    const paid = status === 'PAID' ? gross : status === 'PARTIALLY_PAID' ? gross.times('0.4').round(2, Big.roundHalfUp) : new Big(0);
    docs.push({
      id: `demo-doc-${i + 1}`, kind: incoming ? 'RECEIVED_INVOICE' : 'INVOICE',
      number: `${incoming ? 'PF' : 'FA'}${y}${String(i + 1).padStart(4, '0')}`,
      status, issueDate, dueDate, contactId: contact.id, contactName: contact.name, currency: 'EUR',
      totalNet: net.toFixed(2), totalVat: vat.toFixed(2), totalGross: gross.toFixed(2), paidAmount: paid.toFixed(2)
    });
  }
  return docs.sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1));
}

export function buildDemoData(names, today) {
  const company = demoCompany(names);
  const contacts = demoContacts(names);
  return { company, contacts, documents: demoDocuments(contacts, today) };
}
