// Editor logic: draft defaults, VAT choices, lines, live totals,
// conversions and the store actions (issue, payments, delete, unlock).
import { describe, it, expect } from 'vitest';
import { paidAmount } from '@we-invoice/core';
import {
  newDraft, applyContact, withIssueDate, vatChoices, withVatChoice, defaultVat, emptyLine, lineFromItem, insertLine, removeLine, moveLine,
  duplicateLine, updateLine, liveTotals, duplicateDocument, dueDateFor, languageFor
} from './draft.js';
import { availableConversions, convertForEditor, deductionCandidates, correctionCandidates, advanceAvailable, needsReason } from './convert.js';
import { issueDraft, saveDocument, createDraft, deleteDraft, addPayment, removePayment, updatePayment, setStatus, unlockDocument } from './actions.js';
import { COMPANY, CONTACT, memoryStore } from '../documents/fixtures.js';

const TODAY = '2026-10-18';
const NONPAYER = { ...COMPANY, vatMode: 'NONPAYER', icDph: null };

function filled(draft) {
  return { ...draft, lines: [{ ...draft.lines[0], name: 'Consulting', qty: '10', unitPrice: '50' }] };
}

describe('draft defaults', () => {
  it('takes due days and language from the client, else from the company', () => {
    const contact = { ...CONTACT, id: 'c1' };
    const d = newDraft({ kind: 'INVOICE', company: COMPANY, contact, today: TODAY, id: 'x' });
    expect(d).toMatchObject({ status: 'DRAFT', issueDate: TODAY, taxDate: TODAY, dueDate: '2026-11-17', language: 'en', currency: 'EUR', bankAccountId: 'bank-1', contactId: 'c1' });
    expect(d.buyer.name).toBe('Beta a. s.');
    const plain = newDraft({ kind: 'INVOICE', company: COMPANY, today: TODAY });
    expect(plain).toMatchObject({ dueDate: '2026-11-01', language: 'sk', buyer: null });
    expect(newDraft({ kind: 'QUOTE', company: COMPANY, today: TODAY })).toMatchObject({ taxDate: null, dueDate: null, validUntil: '2026-11-17' });
    expect(newDraft({ kind: 'DELIVERY_NOTE', company: COMPANY, today: TODAY }).dueDate).toBeNull();
    expect(dueDateFor(TODAY, { dueDays: 0 }, COMPANY)).toBe(TODAY);
    expect(dueDateFor(TODAY, null, { defaults: {} })).toBe('2026-11-01');
    expect(languageFor(null, { defaults: { language: 'de' } })).toBe('de');
  });

  it('follows a new client and a new issue date', () => {
    const d = newDraft({ kind: 'INVOICE', company: COMPANY, today: TODAY });
    const withClient = applyContact(d, { ...CONTACT, id: 'c1' }, COMPANY);
    expect(withClient).toMatchObject({ contactId: 'c1', language: 'en', dueDate: '2026-11-17' });
    const moved = withIssueDate(withClient, '2026-10-20', { ...CONTACT, id: 'c1' }, COMPANY);
    expect(moved).toMatchObject({ issueDate: '2026-10-20', taxDate: '2026-10-20', dueDate: '2026-11-19' });
    const ownTax = withIssueDate({ ...withClient, taxDate: '2026-10-01' }, '2026-10-20', null, COMPANY);
    expect(ownTax.taxDate).toBe('2026-10-01');
  });

  it('offers the rates valid on the date and fills exemption references from legislation', () => {
    expect(vatChoices(TODAY).map(c => c.value)).toEqual(['S:23', 'S:19', 'S:5', 'Z', 'E', 'AE', 'K', 'G', 'O']);
    expect(vatChoices('2024-06-01').slice(0, 3).map(c => c.value)).toEqual(['S:20', 'S:10', 'S:5']);
    const line = emptyLine({ company: COMPANY, date: TODAY, id: 'l' });
    expect(line).toMatchObject({ vatCategory: 'S', vatRate: '23', qty: '1', priceType: 'NET' });
    expect(withVatChoice(line, 'AE', TODAY)).toMatchObject({ vatCategory: 'AE', vatRate: '0', exemptionReasonCode: 'VATEX-EU-AE' });
    expect(withVatChoice(line, 'O', TODAY)).toMatchObject({ vatRate: null, exemptionReasonCode: 'VATEX-EU-O' });
    expect(withVatChoice({ ...line, vatCategory: 'E', exemptionReasonText: 'own' }, 'E', TODAY).exemptionReasonText).toBe('own');
    expect(withVatChoice(line, 'S:19', TODAY)).toMatchObject({ vatCategory: 'S', vatRate: '19', exemptionReasonCode: null });
    expect(defaultVat(NONPAYER, TODAY)).toMatchObject({ vatCategory: 'O', vatRate: null, exemptionReasonCode: 'VATEX-EU-O' });
  });

  it('builds a line from a price list item', () => {
    const item = { id: 'i1', name: 'Hour', unit: { code: 'HUR', label: 'hod.' }, price: '40', priceType: 'NET', vatCategory: 'S', vatRate: '19' };
    expect(lineFromItem(item, { company: COMPANY, date: TODAY, id: 'l' })).toMatchObject({ itemId: 'i1', name: 'Hour', unitPrice: '40', vatRate: '19', unit: { code: 'HUR' } });
    expect(lineFromItem(item, { company: COMPANY, date: TODAY, price: '35' }).unitPrice).toBe('35');
    expect(lineFromItem(item, { company: NONPAYER, date: TODAY }).vatCategory).toBe('O');
  });

  it('inserts, moves, copies, updates and removes lines', () => {
    const a = { id: 'a' }; const b = { id: 'b' }; const c = { id: 'c' };
    let lines = insertLine([a, b], c, 1);
    expect(lines.map(l => l.id)).toEqual(['a', 'c', 'b']);
    lines = moveLine(lines, 0, 2);
    expect(lines.map(l => l.id)).toEqual(['c', 'b', 'a']);
    lines = duplicateLine(lines, 'b', 'b2');
    expect(lines.map(l => l.id)).toEqual(['c', 'b', 'b2', 'a']);
    expect(updateLine(lines, 'a', { name: 'x' }).find(l => l.id === 'a').name).toBe('x');
    expect(removeLine(lines, 'c').map(l => l.id)).toEqual(['b', 'b2', 'a']);
    expect(moveLine(lines, 9, 0)).toBe(lines);
  });

  it('computes live totals and reports an incomplete line instead of throwing', () => {
    const d = filled(newDraft({ kind: 'INVOICE', company: COMPANY, today: TODAY }));
    expect(liveTotals(d, COMPANY).totals).toMatchObject({ net: '500.00', vat: '115.00', gross: '615.00' });
    const discounted = { ...d, docDiscount: { pct: '10', amount: null, reason: null } };
    expect(liveTotals(discounted, COMPANY).totals.net).toBe('450.00');
    const cash = { ...d, lines: [{ ...d.lines[0], unitPrice: '10.01', qty: '1' }], paymentMethod: 'CASH' };
    expect(liveTotals(cash, { ...COMPANY, defaults: { ...COMPANY.defaults, roundingCash: true } }).totals.payable).toBe('12.30');
    expect(liveTotals({ ...d, lines: [{ ...d.lines[0], vatRate: null }] }, COMPANY)).toEqual({ totals: null, error: 'VAT_RATE_REQUIRED' });
  });

  it('copies a document into a fresh draft', () => {
    const src = { ...filled(newDraft({ kind: 'INVOICE', company: COMPANY, today: '2026-01-05', id: 'src' })), status: 'PAID', number: 'FA1', payments: [{ id: 'p' }], lockedAt: '2026-01-06T00:00:00Z' };
    const copy = duplicateDocument(src, { today: TODAY, id: 'copy', company: COMPANY });
    expect(copy).toMatchObject({ id: 'copy', status: 'DRAFT', number: null, issueDate: TODAY, payments: [], lockedAt: null, totals: null });
    expect(copy.lines[0].id).not.toBe(src.lines[0].id);
    expect(copy.lines[0].name).toBe('Consulting');
  });
});

describe('conversions', () => {
  const proforma = (over = {}) => ({ ...filled(newDraft({ kind: 'PROFORMA', company: COMPANY, today: '2026-10-01', id: 'pf' })), status: 'ISSUED', number: 'ZF1', contactId: 'c1', ...over });
  const paid = { payments: [{ id: 'p1', date: '2026-10-05', amount: '615.00', currency: 'EUR', method: 'TRANSFER', source: 'MANUAL' }] };

  it('offers the advance tax document only after a payment', () => {
    expect(availableConversions(proforma())).toEqual(['INVOICE']);
    expect(availableConversions(proforma(paid))).toEqual(['ADVANCE_TAX_DOC', 'INVOICE']);
    expect(availableConversions({ ...proforma(), status: 'DRAFT' })).toEqual([]);
    expect(needsReason('CREDIT_NOTE')).toBe(true);
    expect(needsReason('INVOICE')).toBe(false);
  });

  it('deducts the paid advance in the final invoice', () => {
    const pf = proforma(paid);
    const invoice = convertForEditor(pf, 'INVOICE', { today: TODAY, company: COMPANY, documents: [pf], id: 'inv' });
    expect(invoice.links).toEqual([{ kind: 'FROM_PROFORMA', docId: 'pf' }, { kind: 'ADVANCE_DEDUCTION', docId: 'pf', amount: '615.00' }]);
    expect(liveTotals(invoice, COMPANY).totals).toMatchObject({ gross: '615.00', prepaid: '615.00', payable: '0.00' });
    expect(invoice.dueDate).toBe('2026-11-01');
  });

  it('deducts the tax document to the payment when there is one', () => {
    const pf = proforma(paid);
    const adv = { ...convertForEditor(pf, 'ADVANCE_TAX_DOC', { today: TODAY, documents: [pf], id: 'adv' }), status: 'ISSUED', number: 'DD1' };
    expect(adv.taxDate).toBe('2026-10-05');
    expect(availableConversions(pf, [pf, adv])).toEqual(['INVOICE']);
    const invoice = convertForEditor(pf, 'INVOICE', { today: TODAY, documents: [pf, adv] });
    expect(invoice.links.filter(l => l.kind === 'ADVANCE_DEDUCTION')).toEqual([{ kind: 'ADVANCE_DEDUCTION', docId: 'adv', amount: '615.00' }]);
    expect(deductionCandidates([pf, adv], { contactId: 'c1', currency: 'EUR' }).map(d => d.id)).toEqual(['adv']);
    const used = { ...invoice, status: 'ISSUED' };
    expect(advanceAvailable(adv, [pf, adv, used])).toBe('0.00');
    expect(deductionCandidates([pf, adv, used], { contactId: 'c1', currency: 'EUR' })).toEqual([]);
  });

  it('needs a reason for a credit note and lists invoices to correct', () => {
    const inv = { ...filled(newDraft({ kind: 'INVOICE', company: COMPANY, today: TODAY, id: 'inv' })), status: 'ISSUED', number: 'FA1', contactId: 'c1' };
    expect(() => convertForEditor(inv, 'CREDIT_NOTE', { today: TODAY })).toThrow(expect.objectContaining({ code: 'CORRECTION_REASON_REQUIRED' }));
    const cn = convertForEditor(inv, 'CREDIT_NOTE', { today: TODAY, reason: 'Wrong quantity' });
    expect(cn).toMatchObject({ kind: 'CREDIT_NOTE', correctionReason: 'Wrong quantity', links: [{ kind: 'CORRECTS', docId: 'inv' }] });
    expect(correctionCandidates([inv, { ...inv, id: 'd', status: 'DRAFT' }], { contactId: 'c1' }).map(d => d.id)).toEqual(['inv']);
  });
});

describe('store actions', () => {
  async function withClient() {
    const made = await memoryStore();
    const contact = await made.store.insert('contacts', structuredClone(CONTACT));
    return { ...made, contact };
  }

  it('issues a draft: number from a new default series, snapshots, totals, event', async () => {
    const { store, contact, events } = await withClient();
    const draft = filled(newDraft({ kind: 'INVOICE', company: store.company(), contact, today: TODAY }));
    await saveDocument(store, draft);
    const sent = [];
    const doc = await issueDraft(store, store.get('documents', draft.id), { emit: (name, payload) => sent.push({ name, payload }), now: '2026-10-18T10:00:00.000Z' });
    expect(doc).toMatchObject({ status: 'ISSUED', number: 'FA20260001', vs: '20260001', totals: { gross: '615.00' } });
    expect(doc.seller).toMatchObject({ name: 'Alfa s. r. o.', icDph: 'SK2020000004' });
    expect(doc.buyer).toMatchObject({ name: 'Beta a. s.', contactId: contact.id });
    const series = store.company().series;
    expect(series).toHaveLength(1);
    expect(series[0]).toMatchObject({ kind: 'INVOICE', isDefault: true, counters: { 2026: 2 } });
    expect(sent).toEqual([{ name: 'stock:document-issued', payload: { documentId: doc.id } }]);
    expect(store.list('auditLog').map(a => a.action)).toEqual(['ISSUE']);
    expect(events.some(e => e.name === 'data:changed')).toBe(true);

    const second = filled(newDraft({ kind: 'INVOICE', company: store.company(), contact, today: TODAY }));
    expect((await issueDraft(store, second, { emit: () => {} })).number).toBe('FA20260002');
    expect(store.company().series).toHaveLength(1);
  });

  it('a non-payer issues lines outside the scope of VAT without a rate', async () => {
    const { store } = await memoryStore({ company: { ...COMPANY, vatMode: 'NONPAYER', icDph: null } });
    const contact = await store.insert('contacts', structuredClone(CONTACT));
    const draft = filled(newDraft({ kind: 'INVOICE', company: store.company(), contact, today: TODAY }));
    expect(draft.lines[0]).toMatchObject({ vatCategory: 'O', vatRate: null, exemptionReasonCode: 'VATEX-EU-O' });
    const doc = await issueDraft(store, draft, { emit: () => {} });
    expect(doc.totals).toMatchObject({ net: '500.00', vat: '0.00', gross: '500.00' });
    expect(doc.totals.breakdown).toEqual([expect.objectContaining({ category: 'O', rate: null })]);
    expect(doc.seller).toMatchObject({ vatPayer: false, icDph: null });
  });

  it('refuses an incomplete document and stores nothing', async () => {
    const { store } = await withClient();
    const draft = newDraft({ kind: 'INVOICE', company: store.company(), today: TODAY });
    await expect(issueDraft(store, draft, { emit: () => {} })).rejects.toMatchObject({ code: 'DOCUMENT_INCOMPLETE' });
    expect(store.list('documents')).toEqual([]);
    expect(store.company().series).toEqual([]);
  });

  it('records, edits and removes payments; deletes only drafts', async () => {
    const { store, contact } = await withClient();
    const doc = await issueDraft(store, filled(newDraft({ kind: 'INVOICE', company: store.company(), contact, today: TODAY })), { emit: () => {} });
    const p = await addPayment(store, doc.id, { date: TODAY, amount: '100.00', method: 'CASH' });
    expect(p).toMatchObject({ currency: 'EUR', source: 'CASH', ekasaReceiptId: null });
    await updatePayment(store, doc.id, p.id, { ekasaReceiptId: 'O-123' });
    expect(store.get('documents', doc.id).payments[0].ekasaReceiptId).toBe('O-123');
    expect(paidAmount(store.get('documents', doc.id))).toBe('100.00');
    await removePayment(store, doc.id, p.id);
    expect(store.get('documents', doc.id).payments).toEqual([]);
    await expect(deleteDraft(store, doc.id)).rejects.toMatchObject({ code: 'DOCUMENT_NOT_DRAFT' });
    const draft = await createDraft(store, newDraft({ kind: 'QUOTE', company: store.company(), today: TODAY }));
    await deleteDraft(store, draft.id);
    expect(store.get('documents', draft.id)).toBeNull();
  });

  it('moves statuses the user may choose and unlocks with an audit entry', async () => {
    const { store, contact } = await withClient();
    const quote = await issueDraft(store, filled(newDraft({ kind: 'QUOTE', company: store.company(), contact, today: TODAY })), { emit: () => {} });
    expect(quote.number).toBe('CP20260001');
    expect((await setStatus(store, quote.id, 'ACCEPTED')).status).toBe('ACCEPTED');
    await expect(setStatus(store, quote.id, 'DRAFT')).rejects.toMatchObject({ code: 'STATUS_TRANSITION_INVALID' });
    await store.update('documents', quote.id, { lockedAt: '2026-10-18T11:00:00.000Z' });
    expect((await unlockDocument(store, quote.id, 'typo')).lockedAt).toBeNull();
    expect(store.list('auditLog').find(a => a.action === 'UNLOCK')).toMatchObject({ entityId: quote.id, reason: 'typo' });
  });
});
