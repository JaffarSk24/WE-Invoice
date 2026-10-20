// Attachments of sales documents: the 10 MB limit, storing files beside
// the document, removal with a change log entry once issued, reading a
// file back, and the e-invoice that stays the same with attachments on
// the document (the PDF is embedded only by attachPdfToEInvoice).
import { describe, it, expect } from 'vitest';
import { buildUbl } from '@we-invoice/core';
import {
  MAX_ATTACHMENT_BYTES, attachmentError, attachmentRecord, removalNeedsConfirmation, storeAttachmentFiles, addAttachments, removeAttachment, attachmentBlob
} from './attachments.js';
import { hasContent } from './editor-actions.js';
import { newDraft, duplicateDocument } from './draft.js';
import { issueDraft } from './actions.js';
import { COMPANY, CONTACT, memoryStore } from '../documents/fixtures.js';

const TODAY = '2026-10-18';
const file = (name, size, type = 'application/pdf') => ({ name, size, type, arrayBuffer: async () => new Uint8Array(Math.min(size, 4)).buffer });

function fakeFiles() {
  const map = new Map();
  return { map, put: async (id, f) => { map.set(id, f); }, get: async (id) => map.get(id) || null, remove: async (id) => { map.delete(id); } };
}

async function issuedInvoice(store) {
  const contact = await store.insert('contacts', structuredClone(CONTACT));
  const draft = newDraft({ kind: 'INVOICE', company: store.company(), contact, today: TODAY });
  draft.lines[0] = { ...draft.lines[0], name: 'Work', qty: '1', unitPrice: '100' };
  return issueDraft(store, draft, { emit: () => {} });
}

describe('attachment rules', () => {
  it('accepts any file up to 10 MB', () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(10 * 1024 * 1024);
    expect(attachmentError(file('a.pdf', MAX_ATTACHMENT_BYTES))).toBeNull();
    expect(attachmentError(file('a.pdf', MAX_ATTACHMENT_BYTES + 1))).toBe('ATTACHMENT_TOO_LARGE');
    expect(attachmentError(file('a.pdf', 0))).toBe('ATTACHMENT_EMPTY');
    expect(attachmentError({ size: 5 })).toBe('ATTACHMENT_INVALID');
    expect(attachmentRecord(file('x.docx', 10, ''), 'id1')).toEqual({ id: 'id1', name: 'x.docx', mime: 'application/octet-stream', size: 10 });
    expect(removalNeedsConfirmation({ status: 'DRAFT' })).toBe(false);
    expect(removalNeedsConfirmation({ status: 'ISSUED' })).toBe(true);
  });

  it('stores nothing when one of the files is too large', async () => {
    const files = fakeFiles();
    await expect(storeAttachmentFiles([file('a.pdf', 10), file('big.zip', MAX_ATTACHMENT_BYTES + 1)], files)).rejects.toMatchObject({ code: 'ATTACHMENT_TOO_LARGE' });
    expect(files.map.size).toBe(0);
  });

  it('counts a draft with only attachments as content and never copies them', () => {
    expect(hasContent({ lines: [], attachments: [{ id: 'a' }] })).toBe(true);
    const copy = duplicateDocument({ ...newDraft({ kind: 'INVOICE', company: COMPANY, today: TODAY }), attachments: [{ id: 'a', name: 'x' }], removedAttachments: [{ id: 'b', name: 'y', removedAt: '2026-10-20T10:00:00.000Z' }] }, { today: TODAY });
    expect(copy.attachments).toEqual([]);
    expect(copy.removedAttachments).toEqual([]);
  });
});

describe('attachments in the store', () => {
  it('adds any number of files to a document and reads them back', async () => {
    const { store } = await memoryStore();
    const doc = await issuedInvoice(store);
    const files = fakeFiles();
    const records = await addAttachments(store, doc.id, [file('a.pdf', 3), file('b.png', 4, 'image/png'), file('c.txt', 2, 'text/plain')], files);
    expect(records.map(r => r.name)).toEqual(['a.pdf', 'b.png', 'c.txt']);
    expect(store.get('documents', doc.id).attachments.map(a => a.id)).toEqual(records.map(r => r.id));
    const blob = await attachmentBlob(records[1], files);
    expect(blob.type).toBe('image/png');
    expect(await attachmentBlob({ id: 'nowhere' }, files)).toBeNull();
  });

  it('removes from a draft quietly and from an issued document with a change log entry', async () => {
    const { store } = await memoryStore();
    const files = fakeFiles();
    const draft = await store.insert('documents', newDraft({ kind: 'QUOTE', company: store.company(), today: TODAY }));
    const [d] = await addAttachments(store, draft.id, [file('d.pdf', 3)], files);
    await removeAttachment(store, draft.id, d.id, files);
    expect(store.get('documents', draft.id).attachments).toEqual([]);
    expect(files.map.has(d.id)).toBe(false);
    expect(store.list('auditLog').filter(a => a.reason === 'attachment removed')).toEqual([]);

    const doc = await issuedInvoice(store);
    const [a] = await addAttachments(store, doc.id, [file('zmluva.pdf', 3)], files);
    await removeAttachment(store, doc.id, a.id, files);
    expect(store.get('documents', doc.id).attachments).toEqual([]);
    expect(store.list('auditLog').find(e => e.reason === 'attachment removed')).toMatchObject({
      action: 'UPDATE', entity: 'Document', entityId: doc.id, changes: [{ field: 'attachments', from: 'zmluva.pdf', to: null }]
    });
    expect(await removeAttachment(store, doc.id, 'unknown', files)).toBeNull();
  });

  it('keeps the file of an attachment removed from an issued document in its archive', async () => {
    const { store } = await memoryStore();
    const files = fakeFiles();
    const doc = await issuedInvoice(store);
    const [a] = await addAttachments(store, doc.id, [file('zmluva.pdf', 3)], files);
    await removeAttachment(store, doc.id, a.id, { ...files, now: () => '2026-10-20T10:00:00.000Z' });
    const stored = store.get('documents', doc.id);
    expect(stored.attachments).toEqual([]);
    expect(stored.removedAttachments).toEqual([{ id: a.id, name: 'zmluva.pdf', mime: 'application/pdf', size: 3, removedAt: '2026-10-20T10:00:00.000Z', reason: 'REMOVED_BY_USER' }]);
    expect(files.map.has(a.id)).toBe(true);
  });

  it('keeps a file another document still lists', async () => {
    const { store } = await memoryStore();
    const files = fakeFiles();
    const one = await issuedInvoice(store);
    const [a] = await addAttachments(store, one.id, [file('a.pdf', 3)], files);
    const two = await store.insert('documents', { ...newDraft({ kind: 'QUOTE', company: store.company(), today: TODAY }), attachments: [a] });
    await removeAttachment(store, two.id, a.id, files);
    expect(files.map.has(a.id)).toBe(true);
  });
});

describe('e-invoice with attachments', () => {
  it('builds the same UBL whatever the document attachments, and embeds the PDF only when the company wants it', async () => {
    const { store } = await memoryStore();
    const doc = await issuedInvoice(store);
    const pdf = { base64: 'JVBERi0xLjQK', name: 'Faktura.pdf' };
    const plain = buildUbl(doc, store.company(), { pdf });
    const withAttachments = buildUbl({ ...doc, attachments: [{ id: 'a', name: 'zmluva.docx', mime: 'application/msword', size: 9 }] }, store.company(), { pdf });
    expect(withAttachments).toBe(plain);
    expect(plain.match(/AdditionalDocumentReference>/g)).toHaveLength(2);
    expect(plain).not.toContain('zmluva.docx');
    const off = { ...store.company(), defaults: { ...store.company().defaults, attachPdfToEInvoice: false } };
    expect(buildUbl(doc, off, { pdf })).not.toContain('AdditionalDocumentReference');
  });
});
