// Contacts as plain data: a blank card, the checks before saving, search,
// the documents and balance of one client, duplicate detection and the
// merge of duplicates. Pure functions without DOM or network, so the
// screens and the tests share them.
import { isValidIco, isValidDic, isValidVatId, isValidIban, isPayable, isReceived, amountDue, payableOf, add, cmp, round, schema } from '@we-invoice/core';

// What an e-mail address of a contact is for (schema: emails[].purposes).
export const EMAIL_PURPOSES = Object.freeze(['INVOICE', 'REMINDER', 'ACCOUNTANT']);
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export function blankContact(overrides = {}) {
  return {
    kind: 'COMPANY', name: '', ico: null, dic: null, icDph: null, country: 'SK',
    billingAddress: { street: '', city: '', zip: '', country: 'SK' },
    deliveryAddresses: [], emails: [], persons: [], phone: null, iban: null,
    dueDays: null, discountPct: null, language: null, currency: null, sendReminders: true,
    priceLevelId: null, peppolId: null, peppolCapable: null, vatReliability: null, tags: [], note: '',
    ...overrides
  };
}

const text = (v) => (v === null || v === undefined ? '' : String(v).trim());
const orNull = (v) => (text(v) ? text(v) : null);
const compactId = (v) => text(v).replace(/\s/g, '').toUpperCase();

// Cleans a card from the form and lists what is wrong with it. Returns
// { contact, errors } where errors maps a field to an error code
// (crm.error.<CODE> in the dictionaries).
export function normalizeContact(input) {
  const c = { ...blankContact(), ...input };
  const errors = {};
  const out = {
    ...c,
    name: text(c.name),
    ico: orNull(compactId(c.ico)),
    dic: orNull(compactId(c.dic)),
    icDph: orNull(compactId(c.icDph)),
    country: /^[A-Z]{2}$/.test(text(c.country).toUpperCase()) ? text(c.country).toUpperCase() : 'SK',
    phone: orNull(c.phone),
    iban: orNull(compactId(c.iban)),
    language: schema.PRINT_LANGUAGES.includes(c.language) ? c.language : null,
    currency: /^[A-Z]{3}$/.test(text(c.currency)) ? text(c.currency) : null,
    sendReminders: c.sendReminders !== false,
    emails: (c.emails || []).map(e => ({ address: text(e.address), purposes: (e.purposes || []).filter(p => EMAIL_PURPOSES.includes(p)) })).filter(e => e.address),
    persons: (c.persons || []).map(p => ({ name: text(p.name), role: text(p.role), email: text(p.email), phone: text(p.phone) })).filter(p => p.name || p.email || p.phone),
    tags: (c.tags || []).map(text).filter(Boolean)
  };
  out.billingAddress = { street: text(c.billingAddress?.street), city: text(c.billingAddress?.city), zip: text(c.billingAddress?.zip), country: out.country };
  if (!out.name) errors.name = 'NAME_REQUIRED';
  if (out.ico && (out.country === 'SK' || out.country === 'CZ') && !isValidIco(out.ico)) errors.ico = 'ICO_INVALID';
  if (out.dic && out.country === 'SK' && !isValidDic(out.dic)) errors.dic = 'DIC_INVALID';
  if (out.icDph && !isValidVatId(out.icDph)) errors.icDph = 'VAT_ID_INVALID';
  if (out.iban && !isValidIban(out.iban)) errors.iban = 'IBAN_INVALID';
  if (out.emails.some(e => !EMAIL.test(e.address)) || out.persons.some(p => p.email && !EMAIL.test(p.email))) errors.emails = 'EMAIL_INVALID';
  const due = c.dueDays === '' || c.dueDays === null || c.dueDays === undefined ? null : Number(c.dueDays);
  if (due !== null && (!Number.isInteger(due) || due < 0 || due > 3650)) errors.dueDays = 'DUE_DAYS_INVALID';
  out.dueDays = due;
  const discount = text(c.discountPct);
  if (discount && (!/^\d+(\.\d+)?$/.test(discount) || cmp(discount, '100') > 0)) errors.discountPct = 'DISCOUNT_INVALID';
  out.discountPct = discount || null;
  return { contact: out, errors };
}

// The addresses for a purpose; INVOICE also takes addresses without a
// purpose, and any purpose falls back to the first address.
export function emailsFor(contact, purpose = 'INVOICE') {
  const list = (contact && contact.emails) || [];
  const hits = list.filter(e => (e.purposes || []).includes(purpose) || (purpose === 'INVOICE' && !(e.purposes || []).length));
  if (hits.length) return hits.map(e => e.address);
  if (purpose === 'ACCOUNTANT') return [];
  return list.length ? [list[0].address] : [];
}

// Folds case and diacritics, so "kos" finds "Košice".
export function fold(value) {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// Contacts matching a query in name, IČO, DIČ, IČ DPH, e-mail or tag.
export function searchContacts(contacts, query) {
  const q = fold(query);
  const byName = (a, b) => text(a.name).localeCompare(text(b.name), 'sk');
  if (!q) return contacts.slice().sort(byName);
  const compact = q.replace(/\s/g, '');
  return contacts.filter(c => {
    const hay = [c.name, c.city, c.billingAddress?.city, ...(c.tags || []), ...(c.emails || []).map(e => e.address)].map(fold).join(' ');
    const ids = [c.ico, c.dic, c.icDph].map(v => fold(v).replace(/\s/g, '')).join(' ');
    return hay.includes(q) || (compact && ids.includes(compact));
  }).sort(byName);
}

// Outgoing documents of the contact, newest first.
export function contactDocuments(contact, documents) {
  return (documents || []).filter(d => d.contactId === contact.id && !d.deleted)
    .sort((a, b) => String(b.issueDate || b.createdAt || '').localeCompare(String(a.issueDate || a.createdAt || '')));
}

// Gross total and amount due of a stored document; the demo documents
// carry plain totals instead of lines.
export function documentAmounts(doc) {
  if (doc.totalGross !== undefined) {
    return { gross: round(doc.totalGross || '0'), due: round(add(doc.totalGross || '0', `-${doc.paidAmount || '0'}`)) };
  }
  try {
    return { gross: payableOf(doc), due: amountDue(doc) };
  } catch (e) {
    console.warn(`Amounts of document ${doc.id} cannot be computed`, e);
    return { gross: '0.00', due: '0.00' };
  }
}

const COUNTED = (d) => d.status !== 'DRAFT' && d.status !== 'CANCELLED' && !isReceived(d.kind);

// Turnover and amount due per currency for the card ("Saldo"), plus the
// number of overdue documents by the local date `today`.
export function contactBalance(contact, documents, today) {
  const out = {};
  let overdue = 0;
  contactDocuments(contact, documents).filter(COUNTED).forEach(d => {
    const cur = d.currency || 'EUR';
    const slot = out[cur] || (out[cur] = { turnover: '0.00', due: '0.00' });
    const { gross, due } = documentAmounts(d);
    if (d.kind === 'INVOICE' || d.kind === 'CREDIT_NOTE' || d.kind === 'DEBIT_NOTE' || d.kind === 'SELF_BILLING' || d.kind === 'SALES_RECEIPT') slot.turnover = round(add(slot.turnover, gross));
    if (isPayable(d.kind) && cmp(due, '0') > 0) {
      slot.due = round(add(slot.due, due));
      if (d.dueDate && d.dueDate < today) overdue += 1;
    }
  });
  return { byCurrency: out, overdue };
}

// Groups of probable duplicates: the same IČO, or the same folded name
// when neither has an IČO. Each group lists the ids, oldest first.
export function findDuplicates(contacts) {
  const groups = new Map();
  contacts.forEach(c => {
    const key = c.ico ? `ico:${compactId(c.ico)}` : `name:${fold(c.name).replace(/[^a-z0-9]/g, '')}`;
    if (key === 'name:') return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  });
  return Array.from(groups.values()).filter(g => g.length > 1)
    .map(g => g.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''))).map(c => c.id));
}

const unique = (list, key) => {
  const seen = new Set();
  return list.filter(x => { const k = key(x); if (seen.has(k)) return false; seen.add(k); return true; });
};

// Merges duplicates into the kept card: empty fields are filled from the
// others, lists are joined without repeats. Returns the patch for the kept
// card and the ids of the documents to move to it.
export function mergeContacts(keep, others, documents = []) {
  const patch = {};
  const scalar = ['ico', 'dic', 'icDph', 'phone', 'iban', 'dueDays', 'discountPct', 'language', 'currency', 'priceLevelId', 'peppolId', 'note'];
  scalar.forEach(f => {
    if (keep[f] === null || keep[f] === undefined || keep[f] === '') {
      const donor = others.find(o => o[f] !== null && o[f] !== undefined && o[f] !== '');
      if (donor) patch[f] = donor[f];
    }
  });
  const all = [keep, ...others];
  patch.emails = unique(all.flatMap(c => c.emails || []), e => e.address.toLowerCase());
  patch.persons = unique(all.flatMap(c => c.persons || []), p => `${fold(p.name)}|${fold(p.email)}`);
  patch.deliveryAddresses = unique(all.flatMap(c => c.deliveryAddresses || []), a => fold(`${a.street}|${a.city}|${a.zip}`));
  patch.tags = unique(all.flatMap(c => c.tags || []), x => fold(x));
  const ids = new Set(others.map(o => o.id));
  const moveDocs = documents.filter(d => ids.has(d.contactId) && !d.deleted).map(d => d.id);
  return { patch, moveDocs };
}

// A new card from a register answer (CompanyLookup of the gateway).
export function lookupToContact(lookup) {
  const a = lookup.address || {};
  const country = lookup.country || a.country || 'SK';
  return blankContact({
    kind: 'COMPANY', name: lookup.name || '', ico: lookup.ico || null, dic: lookup.dic || null, icDph: lookup.icDph || null, country,
    billingAddress: { street: a.street || '', city: a.city || '', zip: a.zip || '', country }
  });
}

// GDPR: the card of a private person without personal data. Issued
// documents keep their buyer snapshot, which the law requires for ten
// years; only the card is emptied. The name becomes a marker the
// screens show as "anonymized".
export const ANONYMIZED_NAME = '***';

export function anonymizePatch(contact, now = new Date().toISOString()) {
  return {
    name: ANONYMIZED_NAME, ico: null, dic: null, icDph: null, phone: null, iban: null, note: '', tags: [],
    billingAddress: { street: '', city: '', zip: '', country: contact.country || 'SK' },
    deliveryAddresses: [], emails: [], persons: [], peppolId: null, peppolCapable: null, vatReliability: null,
    sendReminders: false, anonymizedAt: now
  };
}
