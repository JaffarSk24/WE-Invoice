// Global search over documents, received documents, contacts and price
// list items (03-features.md § 3.16). searchIndex() prepares one entry per
// record with a folded text (lower case, no diacritics), so a query is a
// plain scan of short strings: 10 000 records answer in a few
// milliseconds. A query matches by every word, by the variable symbol, by
// the document number and by an amount typed in any usual format.
import { isReceived } from '../documents/kinds.js';
import { parseAmount, round } from '../money/index.js';

export const SEARCH_TYPES = Object.freeze(['document', 'received', 'contact', 'item']);
const COMBINING = /[̀-ͯ]/g;

/** Lower case without diacritics: "Žilina" -> "zilina". */
export function fold(text) {
  return String(text ?? '').normalize('NFD').replace(COMBINING, '').toLowerCase();
}

const join = (...parts) => fold(parts.flat().filter(v => v !== null && v !== undefined && v !== '').join(' '));

function amountKey(value) {
  if (value === null || value === undefined || value === '') return null;
  try {
    return round(String(value).replace('-', ''), 2);
  } catch {
    return null;
  }
}

function documentEntry(doc) {
  const received = isReceived(doc.kind);
  const party = received ? doc.seller : doc.buyer;
  const name = (party && party.name) || doc.contactName || '';
  const totals = doc.totals || {};
  const amounts = [totals.gross, totals.payable, doc.totalGross].map(amountKey).filter(Boolean);
  return {
    type: received ? 'received' : 'document',
    id: doc.id,
    kind: doc.kind,
    status: doc.status || null,
    title: doc.number || '',
    subtitle: name,
    date: doc.issueDate || doc.receivedDate || null,
    amount: totals.gross ?? doc.totalGross ?? null,
    currency: doc.currency || 'EUR',
    number: fold(doc.number || ''),
    vs: String(doc.vs || ''),
    amounts: Array.from(new Set(amounts)),
    text: join(doc.number, doc.vs, name, party && party.ico, party && party.icDph, doc.tags, doc.projectRef, doc.orderReference, doc.buyerReference)
  };
}

function contactEntry(contact) {
  const emails = (contact.emails || []).map(e => (typeof e === 'string' ? e : e && e.address));
  const city = (contact.billingAddress && contact.billingAddress.city) || contact.city || '';
  return {
    type: 'contact', id: contact.id, kind: contact.kind || null, status: null, title: contact.name || '', subtitle: [contact.ico, city].filter(Boolean).join(', '),
    date: null, amount: null, currency: null, number: '', vs: '', amounts: [],
    text: join(contact.name, contact.ico, contact.dic, contact.icDph, emails, city, contact.phone, contact.tags)
  };
}

function itemEntry(item) {
  return {
    type: 'item', id: item.id, kind: null, status: null, title: item.name || '', subtitle: item.code || '',
    date: null, amount: item.price ?? null, currency: item.currency || 'EUR', number: fold(item.code || ''), vs: '', amounts: [amountKey(item.price)].filter(Boolean),
    text: join(item.name, item.code, item.barcode, String(item.description || '').slice(0, 200))
  };
}

const live = (list) => (list || []).filter(r => r && !r.deleted);

/**
 * @param {{documents?: object[], contacts?: object[], items?: object[]}} data
 * @returns {{entries: object[], size: number}}
 */
export function searchIndex(data = {}) {
  const entries = [
    ...live(data.documents).map(documentEntry),
    ...live(data.contacts).map(contactEntry),
    ...live(data.items).map(itemEntry)
  ];
  return { entries, size: entries.length };
}

function score(entry, words, digits, amount, folded) {
  let s = 0;
  if (digits && entry.vs && entry.vs === digits) s += 120;
  else if (digits && entry.vs && entry.vs.startsWith(digits)) s += 50;
  if (entry.number && entry.number === folded) s += 110;
  else if (entry.number && folded && entry.number.includes(folded)) s += 60;
  if (amount && entry.amounts.includes(amount)) s += 90;
  if (words.length && words.every(w => entry.text.includes(w))) {
    s += 20;
    if (fold(entry.title).startsWith(words[0])) s += 25;
  }
  return s;
}

/**
 * Searches a prepared index.
 * @param {{entries: object[]}} index
 * @param {string} query
 * @param {{limit?: number, types?: string[]}} [options]
 * @returns {{query: string, results: object[], total: number, counts: Record<string, number>}}
 */
export function searchQuery(index, query, options = {}) {
  const { limit = 50, types = SEARCH_TYPES } = options;
  const folded = fold(query).trim();
  const counts = Object.fromEntries(SEARCH_TYPES.map(t => [t, 0]));
  if (!folded || !index) return { query: folded, results: [], total: 0, counts };
  const words = folded.split(/\s+/).filter(Boolean);
  const compact = folded.replace(/\s+/g, '');
  const digits = /^\d{1,10}$/.test(compact) ? compact : null;
  const parsed = parseAmount(query);
  const amount = parsed !== null && /\d/.test(query) ? amountKey(parsed) : null;
  const wanted = new Set(types);
  const hits = [];
  for (const entry of index.entries) {
    if (!wanted.has(entry.type)) continue;
    const s = score(entry, words, digits, amount, folded);
    if (s > 0) {
      hits.push({ entry, s });
      counts[entry.type] += 1;
    }
  }
  hits.sort((a, b) => b.s - a.s || String(b.entry.date || '').localeCompare(String(a.entry.date || '')) || a.entry.title.localeCompare(b.entry.title));
  const results = hits.slice(0, limit).map(({ entry, s }) => {
    const { text, amounts, number, ...rest } = entry;
    void text; void amounts; void number;
    return { ...rest, score: s };
  });
  return { query: folded, results, total: hits.length, counts };
}
