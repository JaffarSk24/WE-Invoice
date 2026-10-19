// The import plan: what of the parsed drafts is new and what is already
// in the company's data. Contacts are matched by IČO (else by name and
// country), items by code (else by name), documents by direction and
// number (and, for received ones, the supplier). The user sees the plan
// as the preview; applying it adds records in one step and returns the
// new data root. Nothing is ever overwritten by an import.
import { normalizeKey, readIco } from './values.js';
import { skip, warn } from './report.js';
import { computeTotals } from '../vat/index.js';
import { isPurchase } from '../exports/period.js';
import { DOCUMENT_KINDS } from '../schema/enums.js';
import { uuidv7 } from '../ids/uuid.js';

export function contactKey(c) {
  const ico = readIco(c && c.ico);
  if (ico) return `ico:${ico.padStart(8, '0')}`;
  return `name:${normalizeKey(c && c.name)}|${(c && (c.country || (c.billingAddress || c.address || {}).country)) || ''}`;
}

export function itemKey(item) {
  return item.code ? `code:${normalizeKey(item.code)}` : `name:${normalizeKey(item.name)}`;
}

function partnerOf(d) {
  return (isPurchase(d) ? d.seller : d.buyer) || {};
}

export function documentKey(d) {
  const direction = isPurchase(d) ? 'IN' : 'OUT';
  const supplier = direction === 'IN' ? contactKey(partnerOf(d)) : '';
  return `${direction}|${normalizeKey(d.number)}|${supplier}`;
}

const live = (list) => (list || []).filter(r => r && !r.deleted);

/**
 * @param {{contacts: object[], items: object[], documents: object[], report: object}} parsed
 * @param {{contacts?: object[], items?: object[], documents?: object[]}} existing  the company's records
 */
export function buildImportPlan(parsed, existing = {}) {
  const report = parsed.report;
  const known = new Map(live(existing.contacts).map(c => [contactKey(c), c.id]));
  const seen = new Set();
  const contacts = [];
  for (const draft of parsed.contacts || []) {
    const key = contactKey(draft);
    if (seen.has(key)) continue;
    seen.add(key);
    if (known.has(key)) {
      contacts.push({ draft, key, action: 'link', matchId: known.get(key) });
      report.linked.contacts++;
    } else {
      contacts.push({ draft, key, action: 'add' });
    }
  }

  const knownItems = new Set(live(existing.items).map(itemKey));
  const items = [];
  for (const draft of parsed.items || []) {
    const key = itemKey(draft);
    if (knownItems.has(key)) {
      skip(report, 'items', draft.code || draft.name, 'DUPLICATE_ITEM');
      continue;
    }
    knownItems.add(key);
    items.push({ draft, key, action: 'add' });
  }

  const knownDocs = new Set(live(existing.documents).filter(d => d.number).map(documentKey));
  const documents = [];
  for (const draft of parsed.documents || []) {
    const key = documentKey(draft);
    if (!DOCUMENT_KINDS.includes(draft.kind)) {
      skip(report, 'documents', draft.number, 'KIND_UNSUPPORTED');
      continue;
    }
    if (knownDocs.has(key)) {
      skip(report, 'documents', draft.number, 'DUPLICATE_NUMBER');
      continue;
    }
    try {
      computeTotals(draft);
    } catch (e) {
      skip(report, 'documents', draft.number, e.code || 'INVALID_AMOUNTS');
      continue;
    }
    if (!draft.lines.length) warn(report, 'documents', draft.number, 'NO_LINES');
    knownDocs.add(key);
    documents.push({ draft, key, action: 'add', contactKey: partnerOf(draft).name ? contactKey(partnerOf(draft)) : null });
  }
  report.added = { contacts: contacts.filter(c => c.action === 'add').length, items: items.length, documents: documents.length };
  return { contacts, items, documents, report };
}

function stored(totals) {
  const { lineNet, allowances, charges, net, vat, vatEur, gross, prepaid, rounding, payable, breakdown } = totals;
  return { lineNet, allowances, charges, net, vat, vatEur, gross, prepaid, rounding, payable, breakdown: breakdown.map(({ category, rate, base, vat: v }) => ({ category, rate, base, vat: v })) };
}

/**
 * Adds the planned records to a company data root.
 * @param {object} data  the company data root
 * @param {object} plan  from buildImportPlan
 * @param {{now: string, newId?: () => string}} ctx
 * @returns {{data: object, added: {contacts: string[], items: string[], documents: string[]}}}
 */
export function applyImportPlan(data, plan, ctx) {
  const now = ctx.now;
  const newId = ctx.newId || (() => uuidv7());
  const stamp = (draft) => ({ ...draft, id: newId(), createdAt: now, updatedAt: now, deleted: false });
  const ids = new Map(plan.contacts.filter(c => c.action === 'link').map(c => [c.key, c.matchId]));
  const contacts = plan.contacts.filter(c => c.action === 'add').map(c => {
    const record = stamp(c.draft);
    ids.set(c.key, record.id);
    return record;
  });
  const items = plan.items.map(i => stamp(i.draft));
  const documents = plan.documents.map(p => {
    const record = stamp(p.draft);
    const contactId = (p.contactKey && ids.get(p.contactKey)) || null;
    const side = isPurchase(record) ? 'seller' : 'buyer';
    record.contactId = contactId;
    record[side] = { ...(record[side] || {}), contactId };
    record.payments = (record.payments || []).map(pay => ({ ...pay, id: newId() }));
    record.totals = stored(computeTotals(record));
    return record;
  });
  return {
    data: {
      ...data,
      updatedAt: now,
      contacts: [...(data.contacts || []), ...contacts],
      items: [...(data.items || []), ...items],
      documents: [...(data.documents || []), ...documents]
    },
    added: { contacts: contacts.map(r => r.id), items: items.map(r => r.id), documents: documents.map(r => r.id) }
  };
}
