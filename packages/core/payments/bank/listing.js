// Every payment of every document as one flat list for the payments
// screen, with the filters it offers: period, direction, method, source
// and a text search over the document number, the party and the note.
import { abs, round } from '../../money/index.js';
import { kindFitsDirection, partyOf } from './match/candidates.js';
import { normalizeText } from './text.js';

/**
 * @param {object[]} documents
 * @param {{from?: string|null, to?: string|null, direction?: 'IN'|'OUT'|'', method?: string, source?: string, query?: string}} [filter]
 * @returns {Array<{id: string, docId: string, docNumber: string|null, docKind: string, party: string, direction: string,
 *   date: string, amount: string, currency: string, method: string, source: string, note: string|null, payment: object}>}
 */
export function listPayments(documents, filter = {}) {
  const q = normalizeText(filter.query || '');
  const rows = [];
  for (const doc of documents || []) {
    if (doc.deleted || !doc.payments?.length) continue;
    const direction = kindFitsDirection(doc.kind, 'IN') ? 'IN' : 'OUT';
    const party = partyOf(doc)?.name || '';
    for (const p of doc.payments) {
      if (p.deleted) continue;
      if (filter.from && p.date < filter.from) continue;
      if (filter.to && p.date > filter.to) continue;
      if (filter.direction && filter.direction !== direction) continue;
      if (filter.method && p.method !== filter.method) continue;
      if (filter.source && p.source !== filter.source) continue;
      if (q && !normalizeText([doc.number, party, p.note].join(' ')).includes(q)) continue;
      rows.push({
        id: `${doc.id}:${p.id}`, docId: doc.id, docNumber: doc.number || null, docKind: doc.kind, party, direction,
        date: p.date, amount: round(abs(p.amount), 2), currency: p.currency || doc.currency || 'EUR',
        method: p.method, source: p.source, note: p.note || null, payment: p
      });
    }
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date) || String(b.docNumber).localeCompare(String(a.docNumber)));
}
