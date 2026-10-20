// Seeded generator of synthetic data for the performance tests and the
// large end-to-end fixture: a VAT payer company, contacts, price list
// items and documents of every common kind over two years. The same seed
// always gives the same data. Identifiers are synthetic but valid: IČO
// with its mod-11 check digit, DIČ divisible by 11, IČ DPH, IBAN with its
// mod-97 check digits, so the app accepts them as typed by a user.
import { computeTotals } from '../../packages/core/vat/index.js';

/** Mulberry32: a small fast PRNG, enough for test data. */
export function prng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n, len) => String(n).padStart(len, '0');

/** An IČO with a valid check digit from a seven-digit base. */
export function icoFrom(base) {
  const s = pad(base % 10000000, 7);
  let total = 0;
  for (let i = 0; i < 7; i += 1) total += Number(s[i]) * (8 - i);
  return s + String((11 - (total % 11)) % 10);
}

/** A Slovak DIČ (ten digits divisible by 11, not starting with 0). */
export function dicFrom(base) {
  let n = 2000000000 + (base % 900000000);
  n -= n % 11;
  return String(n);
}

/** A Slovak IBAN with valid check digits for a bank code and an account number. */
export function ibanFrom(bank, account) {
  const bban = pad(bank, 4) + pad(0, 6) + pad(account % 10000000000, 10);
  const numeric = `${bban}SK00`.replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const digit of numeric) rest = (rest * 10 + Number(digit)) % 97;
  return `SK${pad(98 - rest, 2)}${bban}`;
}

const NAMES = ['Alfa', 'Beta', 'Gama', 'Delta', 'Omega', 'Tatry', 'Dunaj', 'Javor', 'Lipa', 'Hron', 'Váh', 'Orava', 'Kriváň', 'Sokol', 'Orol'];
const TRADES = ['Stavby', 'Obchod', 'Servis', 'Dizajn', 'Logistika', 'Softvér', 'Účtovníctvo', 'Reklama', 'Elektro', 'Kováč'];
const FORMS = ['s. r. o.', 'a. s.', 'k. s.'];
const CITIES = [['Bratislava', '811 01'], ['Košice', '040 01'], ['Žilina', '010 01'], ['Nitra', '949 01'], ['Prešov', '080 01']];
const ITEMS = ['Konzultácie', 'Montáž', 'Doprava', 'Licencia', 'Školenie', 'Servis', 'Materiál', 'Hosting', 'Preklad', 'Správa webu'];
const RATES = ['23', '23', '23', '19', '5'];
const KINDS = ['INVOICE', 'INVOICE', 'INVOICE', 'INVOICE', 'INVOICE', 'PROFORMA', 'CREDIT_NOTE', 'RECEIVED_INVOICE', 'RECEIVED_INVOICE', 'EXPENSE_RECEIPT'];
const PREFIX = { INVOICE: 'FA', PROFORMA: 'ZF', CREDIT_NOTE: 'DB', RECEIVED_INVOICE: 'PF', EXPENSE_RECEIPT: 'BL' };
const NOW = '2026-10-18T08:00:00.000Z';

export function generateCompany(rand = prng(1)) {
  const base = Math.floor(rand() * 9000000);
  return {
    id: 'gen-company', createdAt: NOW, updatedAt: NOW, name: 'Generovaná firma s. r. o.', legalForm: 'SRO', taxpayerType: 'PO',
    ico: icoFrom(base), dic: dicFrom(base), icDph: `SK${dicFrom(base)}`, vatMode: 'PAYER', vatPeriod: 'MONTH', cashBasis: false, oss: false,
    usesEkasa: false, accountingMode: 'EXTERNAL', address: { street: 'Hlavná 1', city: 'Bratislava', zip: '811 01', country: 'SK' },
    bankAccounts: [{ id: 'gen-acc', name: 'Účet', iban: ibanFrom(1100, base), currency: 'EUR', isDefault: true }],
    defaults: { dueDays: 14, currency: 'EUR', language: 'sk', secondLanguage: null, template: 'CLASSIC', paymentMethod: 'TRANSFER', roundingCash: false, texts: { intro: null, outro: null, footer: null } },
    series: [], closedPeriods: [], note: '', onboardedAt: NOW
  };
}

export function generateContacts(count, rand = prng(2)) {
  return Array.from({ length: count }, (_, i) => {
    const [city, zip] = CITIES[i % CITIES.length];
    const base = 1000000 + i * 7919;
    return {
      id: `gen-contact-${i}`, createdAt: NOW, updatedAt: NOW, kind: 'COMPANY',
      name: `${NAMES[i % NAMES.length]} ${TRADES[Math.floor(rand() * TRADES.length)]} ${i} ${FORMS[i % FORMS.length]}`,
      ico: icoFrom(base), dic: dicFrom(base), icDph: i % 3 ? `SK${dicFrom(base)}` : null, country: 'SK',
      billingAddress: { street: `Ulica ${i}`, city, zip, country: 'SK' }, emails: [{ address: `fakturacia${i}@example.sk`, purposes: ['INVOICE'] }],
      iban: ibanFrom(200, base), dueDays: 14, language: 'sk'
    };
  });
}

export function generateItems(count, rand = prng(3)) {
  return Array.from({ length: count }, (_, i) => ({
    id: `gen-item-${i}`, createdAt: NOW, updatedAt: NOW, name: `${ITEMS[i % ITEMS.length]} ${i}`, code: `P${pad(i, 4)}`,
    unit: { code: 'C62', label: 'ks' }, price: `${10 + Math.floor(rand() * 490)}.${pad(Math.floor(rand() * 100), 2)}`,
    priceType: 'NET', vatCategory: 'S', vatRate: RATES[i % RATES.length], currency: 'EUR', stockTracked: false, prices: {}
  }));
}

function dateIn(rand, from = Date.UTC(2025, 0, 1), days = 655) {
  return new Date(from + Math.floor(rand() * days) * 86400000).toISOString().slice(0, 10);
}

const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/**
 * Documents with lines (one to five) and their totals, numbered per kind
 * and year. A quarter of the issued ones are paid.
 */
export function generateDocuments(count, { company = generateCompany(), contacts = generateContacts(400), items = generateItems(300), seed = 4 } = {}) {
  const rand = prng(seed);
  const counters = {};
  const docs = [];
  for (let i = 0; i < count; i += 1) {
    const kind = KINDS[Math.floor(rand() * KINDS.length)];
    const received = kind === 'RECEIVED_INVOICE' || kind === 'EXPENSE_RECEIPT';
    const contact = contacts[Math.floor(rand() * contacts.length)];
    const issueDate = dateIn(rand);
    const key = `${PREFIX[kind]}${issueDate.slice(0, 4)}`;
    counters[key] = (counters[key] || 0) + 1;
    const lines = Array.from({ length: 1 + Math.floor(rand() * 5) }, (_, l) => {
      const item = items[Math.floor(rand() * items.length)];
      const qty = String(1 + Math.floor(rand() * 20));
      return {
        id: `l${l}`, kind: 'ITEM', itemId: item.id, name: item.name, qty: kind === 'CREDIT_NOTE' ? `-${qty}` : qty, unit: item.unit,
        unitPrice: item.price, priceType: 'NET', vatCategory: 'S', vatRate: item.vatRate, discountPct: rand() < 0.2 ? '10' : null
      };
    });
    const party = { contactId: contact.id, name: contact.name, ico: contact.ico, dic: contact.dic, icDph: contact.icDph, address: contact.billingAddress, vatPayer: Boolean(contact.icDph) };
    const own = { name: company.name, ico: company.ico, dic: company.dic, icDph: company.icDph, address: company.address, vatPayer: true };
    const doc = {
      id: `gen-doc-${i}`, createdAt: NOW, updatedAt: NOW, kind, status: rand() < 0.05 ? 'DRAFT' : (received ? 'PROCESSED' : 'ISSUED'),
      number: `${key}${pad(counters[key], 5)}`, vs: `${issueDate.slice(0, 4)}${pad(counters[key], 5)}`, currency: 'EUR',
      issueDate, taxDate: issueDate, dueDate: addDays(issueDate, 14), receivedDate: received ? addDays(issueDate, 2) : null,
      contactId: contact.id, paymentMethod: 'TRANSFER', language: 'sk', seller: received ? party : own, buyer: received ? own : party,
      lines, docDiscount: rand() < 0.1 ? { pct: '5', amount: null, reason: null } : null,
      tags: rand() < 0.3 ? ['web'] : [], payments: [], sendLog: [], links: [], attachments: [], peppol: null, lockedAt: null, exportedAt: null
    };
    doc.totals = computeTotals(doc);
    if (doc.status !== 'DRAFT' && rand() < 0.25) {
      doc.payments = [{ id: `gen-pay-${i}`, date: addDays(issueDate, 7), amount: doc.totals.payable, currency: 'EUR', method: 'TRANSFER', source: 'MANUAL' }];
    }
    docs.push(doc);
  }
  return docs;
}

/** Everything of one company, as stored in its data file. */
export function generateCompanyData({ documents = 10000, contacts = 400, items = 300, seed = 1 } = {}) {
  const rand = prng(seed);
  const company = generateCompany(rand);
  const contactList = generateContacts(contacts, prng(seed + 1));
  const itemList = generateItems(items, prng(seed + 2));
  return { company, contacts: contactList, items: itemList, documents: generateDocuments(documents, { company, contacts: contactList, items: itemList, seed: seed + 3 }) };
}
