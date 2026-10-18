// Receiving e-invoices (04-peppol.md § 4.7). For every document waiting at
// the provider: download the UBL, archive the original XML in Drive, read
// it, store it as a received invoice or credit note "to process" with all
// lines, VAT by rate and attachments, and only then acknowledge it. The
// provider keeps a document until it is acknowledged, so a failure at any
// step loses nothing: the next run picks it up again. Duplicates (same
// supplier DIČ, number and date, or the same provider id) are acknowledged
// without a second copy.
import { parseUbl, uuidv7 } from '@we-invoice/core';
import { todayLocal } from '../components/dates.js';

const MAX_PAGES = 20;

function contactFields(party) {
  return {
    kind: 'COMPANY', name: party.name || party.icDph || party.dic || '?', ico: party.ico || null, dic: party.dic || null,
    icDph: party.icDph || null, country: party.address?.country || 'SK',
    billingAddress: { street: party.address?.street, city: party.address?.city, zip: party.address?.zip, country: party.address?.country || 'SK' },
    emails: party.email ? [{ address: party.email, purposes: ['invoices'] }] : [], peppolId: party.peppolId || null
  };
}

function base64ToBytes(b64) {
  const binary = globalThis.atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * @param {{store: object, archive: object, connect: () => Promise<object>, emit?: Function, now?: () => string, today?: () => string}} deps
 */
export function createInbox({ store, archive, connect, emit = () => {}, now = () => new Date().toISOString(), today = todayLocal }) {
  function findDuplicate(providerId, item, parsed) {
    return store.list('documents').find(d => (d.peppol?.direction === 'IN' && d.peppol.providerId === providerId && d.peppol.providerMessageId === item.id)
      || (parsed && d.kind?.startsWith('RECEIVED_') && d.number === parsed.number && d.issueDate === parsed.issueDate
        && (d.seller?.dic || null) === (parsed.seller?.dic || null) && (d.seller?.icDph || null) === (parsed.seller?.icDph || null)));
  }

  async function supplierContact(seller) {
    const contacts = store.list('contacts');
    const match = contacts.find(c => (seller.dic && c.dic === seller.dic) || (seller.icDph && c.icDph === seller.icDph) || (seller.peppolId && c.peppolId === seller.peppolId));
    if (match) return match;
    const created = await store.insert('contacts', contactFields(seller));
    emit('peppol:contactCreated', { contactId: created.id });
    return created;
  }

  async function saveAttachments(companyId, docId, attachments) {
    const out = [];
    for (const a of attachments) {
      const id = uuidv7();
      const bytes = base64ToBytes(a.base64);
      await archive.saveAttachment(companyId, id, a.name, bytes);
      out.push({ id, name: a.name, mime: a.mime, size: bytes.length });
    }
    return out;
  }

  async function receiveOne(connection, company, item) {
    const providerId = connection.provider.id;
    const known = findDuplicate(providerId, item, null);
    if (known) {
      await connection.adapter.ack(item.id);
      return { id: item.id, result: 'duplicate', documentId: known.id };
    }
    const { xml } = await connection.adapter.fetch(item.id);
    const docId = uuidv7();
    const receivedOn = today();
    // The original first: without the archived XML nothing is stored or acknowledged.
    const xmlFileId = await archive.saveXml(company.id, receivedOn, docId, xml);
    const { document: parsed, attachments, warnings } = parseUbl(xml, { received: true });
    const duplicate = findDuplicate(providerId, item, parsed);
    if (duplicate) {
      await connection.adapter.ack(item.id);
      return { id: item.id, result: 'duplicate', documentId: duplicate.id };
    }
    const contact = await supplierContact(parsed.seller);
    const at = now();
    const record = await store.insert('documents', {
      ...parsed,
      id: docId,
      status: 'TO_PROCESS',
      contactId: contact.id,
      receivedDate: receivedOn,
      attachments: await saveAttachments(company.id, docId, attachments),
      peppol: {
        direction: 'IN', status: 'RECEIVED', providerId, providerMessageId: item.id, receivedAt: at, acknowledgedAt: null,
        xmlFileId, errors: warnings.map(w => ({ code: w.code, message: [w.field, w.stated, w.computed].filter(Boolean).join(' '), field: w.field || null }))
      }
    });
    await connection.adapter.ack(item.id);
    await store.update('documents', record.id, { peppol: { ...record.peppol, acknowledgedAt: now() } });
    emit('peppol:received', { documentId: record.id, warnings: warnings.length });
    return { id: item.id, result: 'stored', documentId: record.id, warnings: warnings.length };
  }

  /**
   * Fetches everything waiting. Each document is handled on its own: one
   * that cannot be read stays at the provider and is reported in `failed`.
   * @returns {Promise<{stored: number, duplicates: number, failed: Array<{id: string, code: string}>}>}
   */
  async function receiveAll() {
    const company = store.company();
    if (!company || store.readOnly) return { stored: 0, duplicates: 0, failed: [] };
    const connection = await connect();
    const summary = { stored: 0, duplicates: 0, failed: [] };
    let cursor = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const { items, next } = await connection.adapter.receive({ cursor });
      for (const item of items) {
        try {
          const outcome = await receiveOne(connection, company, item);
          if (outcome.result === 'stored') summary.stored++;
          else summary.duplicates++;
        } catch (error) {
          console.error('peppol: received document could not be stored', item.id, error.code || error.name);
          summary.failed.push({ id: item.id, code: error.code || 'UNKNOWN' });
        }
      }
      if (!next || !items.length) break;
      cursor = next;
    }
    return summary;
  }

  return { receiveAll };
}
