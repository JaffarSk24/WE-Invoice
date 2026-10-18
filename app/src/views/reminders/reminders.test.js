// Payment reminders: who is reminded today and with which level, the
// weekend and minimum rules, thank-you notes, late interest by B2B and
// B2C, the printed reminder and the sending of the due ones.
import { describe, it, expect, vi } from 'vitest';
import { computeTotals } from '@we-invoice/core';
import { defaultPolicy, effectivePolicy, dueReminder, remindersDue, thankYouDue, overdueByContact, isWeekend } from './plan.js';
import { penaltyFor, penaltyText, isB2b } from './penalty.js';
import { reminderDocument } from './document.js';
import { sendDueReminders, todaysWork, penaltiesOf } from './runner.js';
import { nextPurpose } from './overdue.js';
import { readPolicy } from '../settings/reminders-section.js';

const line = (price) => ({ id: 'l', kind: 'ITEM', name: 'x', qty: '1', unitPrice: price, priceType: 'NET', vatCategory: 'S', vatRate: '23' });
const inv = (over = {}) => ({ id: 'd1', kind: 'INVOICE', status: 'ISSUED', number: 'FA1', currency: 'EUR', issueDate: '2026-09-01', dueDate: '2026-10-01', contactId: 'c1', lines: [line('100')], payments: [], sendLog: [], ...over });
const sent = (detail) => ({ at: '2026-10-02T08:00:00Z', channel: 'EMAIL', to: 'x@y.sk', result: 'SENT', detail });
const policy = (over = {}) => ({ ...defaultPolicy(), ...over });
const contact = { id: 'c1', kind: 'COMPANY', name: 'Beta', emails: [{ address: 'b@beta.sk' }] };

describe('reminder plan', () => {
  it('reminds before the due date once', () => {
    expect(dueReminder(inv(), { policy: policy(), today: '2026-09-28' })).toMatchObject({ purpose: 'REMINDER_0', days: -3, amountDue: '123.00' });
    expect(dueReminder(inv(), { policy: policy(), today: '2026-09-27' })).toBe(null);
    expect(dueReminder(inv({ sendLog: [sent('REMINDER_0')] }), { policy: policy(), today: '2026-09-29' })).toBe(null);
    expect(dueReminder(inv(), { policy: policy({ beforeDueDays: null }), today: '2026-09-30' })).toBe(null);
  });

  it('picks the level reached and overtakes a skipped one', () => {
    expect(dueReminder(inv(), { policy: policy(), today: '2026-10-05' })).toBe(null);
    expect(dueReminder(inv(), { policy: policy(), today: '2026-10-08' })).toMatchObject({ purpose: 'REMINDER_1', level: 1, days: 7 });
    expect(dueReminder(inv({ sendLog: [sent('REMINDER_1')] }), { policy: policy(), today: '2026-10-15' })).toBe(null);
    expect(dueReminder(inv({ sendLog: [sent('REMINDER_1')] }), { policy: policy(), today: '2026-10-22' })).toMatchObject({ purpose: 'REMINDER_2' });
    expect(dueReminder(inv(), { policy: policy(), today: '2026-11-10' })).toMatchObject({ purpose: 'REMINDER_3' });
    expect(dueReminder(inv({ sendLog: [sent('REMINDER_3')] }), { policy: policy(), today: '2026-11-20' })).toBe(null);
    expect(dueReminder(inv({ sendLog: [{ ...sent('REMINDER_1'), result: 'FAILED' }] }), { policy: policy(), today: '2026-10-09' })).toMatchObject({ purpose: 'REMINDER_1' });
  });

  it('leaves out paid, small, excluded, draft and proforma documents', () => {
    const today = '2026-10-10';
    expect(dueReminder(inv({ payments: [{ id: 'p', date: '2026-10-01', amount: '123', method: 'TRANSFER', source: 'MANUAL' }] }), { policy: policy(), today })).toBe(null);
    expect(dueReminder(inv({ lines: [line('3')] }), { policy: policy(), today })).toBe(null);
    expect(dueReminder(inv(), { policy: policy(), contact: { sendReminders: false }, today })).toBe(null);
    expect(dueReminder(inv({ status: 'DRAFT' }), { policy: policy(), today })).toBe(null);
    expect(dueReminder(inv({ kind: 'PROFORMA' }), { policy: policy(), today })).toBe(null);
    expect(dueReminder(inv({ kind: 'PROFORMA' }), { policy: policy({ includeProformas: true }), today })).toMatchObject({ purpose: 'REMINDER_1' });
    expect(dueReminder(inv(), { policy: policy({ enabled: false }), today })).toBe(null);
  });

  it('sends nothing at the weekend when so set and sorts by due date', () => {
    expect(isWeekend('2026-10-17')).toBe(true);
    expect(isWeekend('2026-10-19')).toBe(false);
    const documents = [inv({ id: 'b', dueDate: '2026-10-05' }), inv({ id: 'a', dueDate: '2026-10-01' })];
    expect(remindersDue({ documents, contacts: [contact], policy: policy(), today: '2026-10-17' })).toEqual([]);
    const due = remindersDue({ documents, contacts: [contact], policy: policy({ skipWeekends: false }), today: '2026-10-17' });
    expect(due.map(d => d.document.id)).toEqual(['a', 'b']);
    expect(due[0].contact).toBe(contact);
    expect(overdueByContact({ documents, contacts: [contact], policy: policy(), today: '2026-10-17' })).toEqual([{ contact, name: 'Beta', documents }]);
  });

  it('thanks for payments of the last two weeks once', () => {
    const paid = inv({ status: 'PAID', payments: [{ id: 'p', date: '2026-10-10', amount: '123', method: 'TRANSFER', source: 'MANUAL' }] });
    const input = { documents: [paid], contacts: [contact], today: '2026-10-12' };
    expect(thankYouDue({ ...input, policy: policy() })).toEqual([]);
    expect(thankYouDue({ ...input, policy: policy({ thankYou: true }) })).toHaveLength(1);
    expect(thankYouDue({ ...input, documents: [{ ...paid, sendLog: [sent('THANK_YOU')] }], policy: policy({ thankYou: true }) })).toEqual([]);
    expect(thankYouDue({ ...input, today: '2026-11-01', policy: policy({ thankYou: true }) })).toEqual([]);
  });

  it('merges the stored policy over the defaults', () => {
    expect(effectivePolicy([])).toMatchObject({ enabled: true, beforeDueDays: 3, levels: [{ afterDays: 7 }, { afterDays: 21 }, { afterDays: 35 }] });
    expect(effectivePolicy([{ id: 'p', enabled: false, levels: [{ afterDays: 10 }] }])).toMatchObject({ enabled: false, levels: [{ afterDays: 10 }], minAmount: '5' });
    expect(nextPurpose(inv({ sendLog: [sent('REMINDER_1')] }))).toBe('REMINDER_2');
  });
});

describe('late interest', () => {
  it('uses the B2B and B2C margins of legislation with the ECB rate', () => {
    const p = policy({ ecbRatePct: '2.15' });
    const b2b = penaltyFor(inv(), { policy: p, contact, today: '2026-10-31', amount: '1000.00' });
    expect(b2b).toMatchObject({ days: 30, ratePct: '11.15', interest: '9.16', recoveryCost: null, total: '9.16' });
    const b2c = penaltyFor(inv(), { policy: p, contact: { kind: 'PERSON' }, today: '2026-10-31', amount: '1000.00' });
    expect(b2c).toMatchObject({ ratePct: '7.15', interest: '5.88' });
    const flat = penaltyFor(inv(), { policy: { ...p, recoveryCostFlat: true }, contact, today: '2026-10-31', amount: '1000.00' });
    expect(flat).toMatchObject({ recoveryCost: '40.00', total: '49.16' });
    expect(penaltyFor(inv({ currency: 'CZK' }), { policy: { ...p, recoveryCostFlat: true }, contact, today: '2026-10-31', amount: '1000.00' }).recoveryCost).toBe(null);
  });

  it('computes nothing without the ECB rate, before the due date or when off', () => {
    expect(penaltyFor(inv(), { policy: policy(), contact, today: '2026-10-31', amount: '100' })).toBe(null);
    expect(penaltyFor(inv(), { policy: policy({ ecbRatePct: '2' }), contact, today: '2026-10-01', amount: '100' })).toBe(null);
    expect(penaltyFor(inv(), { policy: policy({ ecbRatePct: '2', lateInterest: false }), contact, today: '2026-10-31', amount: '100' })).toBe(null);
    expect(isB2b(null, { buyer: { ico: '123' } })).toBe(true);
    expect(isB2b(null, { buyer: { name: 'Jan' } })).toBe(false);
  });

  it('writes the penalty lines in the mail language', () => {
    const text = penaltyText({ interest: '9.16', recoveryCost: '40.00' }, { language: 'en', currency: 'EUR', today: '2026-10-31' });
    expect(text).toBe('\nLate payment interest as of 31/10/2026: €9.16\nFlat-rate compensation for recovery costs: €40.00\n');
    expect(penaltyText(null, { language: 'sk', currency: 'EUR', today: '2026-10-31' })).toBe('');
  });
});

describe('printed reminder', () => {
  it('lists the unpaid invoices and the interest outside the scope of VAT', () => {
    const company = { name: 'Alfa', vatMode: 'PAYER', icDph: 'SK2020000004', address: { city: 'Bratislava', country: 'SK' }, defaults: { language: 'sk' } };
    const doc = reminderDocument({ contact: { ...contact, billingAddress: { city: 'Košice' } }, documents: [inv(), inv({ id: 'd2', number: 'FA2', dueDate: '2026-10-11' })], company, policy: policy({ ecbRatePct: '2.15', recoveryCostFlat: true }), today: '2026-10-31' });
    expect(doc).toMatchObject({ kind: 'REMINDER', number: 'UP20261031', buyer: { name: 'Beta' }, seller: { name: 'Alfa' } });
    expect(doc.lines.map(l => l.name)).toEqual(['Faktúra FA1', 'Faktúra FA2', 'Úrok z omeškania k 31. 10. 2026', 'Paušálna náhrada nákladov spojených s uplatnením pohľadávky (§ 369c Obchodného zákonníka)']);
    expect(doc.lines[0].description).toContain('(30)');
    const totals = computeTotals(doc);
    expect(totals.vat).toBe('0.00');
    expect(totals.payable).toBe('327.88');
  });
});

describe('sending the due reminders', () => {
  function storeWith(documents, policies = []) {
    return {
      readOnly: false, company: () => ({ name: 'Alfa', defaults: { language: 'sk' } }),
      list: (c) => ({ documents, contacts: [contact, { id: 'c2', name: 'No mail', emails: [] }], reminderPolicies: policies }[c] || [])
    };
  }
  const today = '2026-10-09';

  it('only counts the waiting ones unless automatic sending is on', async () => {
    const send = vi.fn();
    const out = await sendDueReminders({ store: storeWith([inv()]), today, send });
    expect(out).toEqual({ sent: 0, waiting: 1, failed: 0, unreachable: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it('sends with the penalties and reports failures and missing addresses', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const send = vi.fn(async ({ document }) => {
      if (document.id === 'bad') throw Object.assign(new Error('x'), { code: 'MAIL_AUTH' });
      return { result: 'SENT' };
    });
    const docs = [inv(), inv({ id: 'bad' }), inv({ id: 'nomail', contactId: 'c2' })];
    const out = await sendDueReminders({ store: storeWith(docs, [{ id: 'p', autoSend: true, ecbRatePct: '2', levels: [{ afterDays: 7 }] }]), today, send });
    expect(out).toEqual({ sent: 1, waiting: 0, failed: 1, unreachable: 1 });
    expect(send.mock.calls[0][0]).toMatchObject({ purpose: 'REMINDER_1' });
    expect(send.mock.calls[0][0].penalties).toContain('Úrok z omeškania');
    vi.restoreAllMocks();
  });

  it('works out the penalties of an entry and today\'s work', () => {
    const work = todaysWork(storeWith([inv()]), today);
    expect(work.reminders).toHaveLength(1);
    expect(penaltiesOf({ ...work.reminders[0], purpose: 'REMINDER_0' }, { policy: work.policy, company: {}, today })).toBe('');
  });
});

describe('reminder settings', () => {
  it('reads levels in order and checks the numbers', () => {
    const { policy: p, errors } = readPolicy({ levels: ['30', '', '10'], beforeDueDays: '', minAmount: '5', ecbRatePct: '2.15' }, {});
    expect(errors).toEqual({});
    expect(p).toMatchObject({ levels: [{ afterDays: 10 }, { afterDays: 30 }], beforeDueDays: null, ecbRatePct: '2.15' });
    expect(readPolicy({ levels: ['0', '', ''], beforeDueDays: '99', minAmount: 'x', ecbRatePct: 'y' }, {}).errors).toEqual({ level0: 'DUE_DAYS_INVALID', beforeDueDays: 'DUE_DAYS_INVALID', minAmount: 'PRICE_INVALID', ecbRatePct: 'PRICE_INVALID' });
  });
});

describe('printed reminder as PDF', () => {
  it('renders through the PDF engine', async () => {
    const { buildPdf, pdfFileNameFor } = await import('../../pdf/index.js');
    const { nodePdfEngine, pdfBytes, pageCount } = await import('../../../../tests/helpers/pdf-node-engine.js');
    const company = { name: 'Alfa s. r. o.', vatMode: 'PAYER', ico: '12345679', icDph: 'SK2020000004', address: { street: 'Hlavná 1', city: 'Bratislava', zip: '81101', country: 'SK' }, bankAccounts: [{ id: 'b', iban: 'SK3112000000198742637541', currency: 'EUR', isDefault: true }], defaults: { language: 'sk' } };
    const doc = reminderDocument({ contact: { ...contact, billingAddress: { street: 'Mlynská 5', city: 'Košice', country: 'SK' } }, documents: [inv()], company, policy: policy({ ecbRatePct: '2.15' }), today: '2026-10-31' });
    const bytes = await pdfBytes(await buildPdf(doc, company, { engine: nodePdfEngine, allowIncomplete: true, qr: false }));
    expect(pageCount(bytes)).toBe(1);
    expect(pdfFileNameFor(doc, company)).toMatch(/\.pdf$/);
  }, 20000);
});
