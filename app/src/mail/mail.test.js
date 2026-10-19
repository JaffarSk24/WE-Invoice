// E-mail of documents: template choice, placeholders in the print
// language, recipients, the mailto link, and the sending through SMTP or
// the mail program with the send log written to the document.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pickTemplate, defaultTemplate, fill, mailLanguage } from './templates.js';
import { documentVars, periodLabel, formatMailDate } from './placeholders.js';
import { composeMail, mailtoUrl, documentLanguage, splitAddresses, invalidAddresses, mailSettings } from './compose.js';
import { sendPatch, sendLogEntry, smtpAccount } from './deliver.js';
import { sendDocumentMail } from './send.js';
import { setDesktopPref } from '../desktop/prefs.js';
import { resetPrefsCache } from '../prefs.js';

const line = { id: 'l1', kind: 'ITEM', name: 'Práca', qty: '10', unitPrice: '50', priceType: 'NET', vatCategory: 'S', vatRate: '23' };
const company = { id: 'co', name: 'Alfa s. r. o.', email: 'alfa@alfa.sk', defaults: { language: 'sk' }, bankAccounts: [{ id: 'b1', iban: 'SK3112000000198742637541', currency: 'EUR', isDefault: true }] };
const contact = { id: 'c1', name: 'Beta', language: 'en', emails: [{ address: 'inv@beta.sk', purposes: ['INVOICE'] }, { address: 'pay@beta.sk', purposes: ['REMINDER'] }, { address: 'acc@beta.sk', purposes: ['ACCOUNTANT'] }] };
const invoice = (over = {}) => ({
  id: 'd1', kind: 'INVOICE', status: 'ISSUED', number: '2026001', vs: '2026001', currency: 'EUR', issueDate: '2026-10-01', dueDate: '2026-10-15',
  contactId: 'c1', buyer: { name: 'Beta', email: 'buyer@beta.sk' }, lines: [line], payments: [], sendLog: [], ...over
});

beforeEach(() => { localStorage.clear(); resetPrefsCache(); });

describe('templates', () => {
  it('prefers the kind template, then the generic one, then the default', () => {
    const own = [
      { id: 'a', purpose: 'SEND', language: 'sk', docKind: null, subject: 'generic', body: 'g' },
      { id: 'b', purpose: 'SEND', language: 'sk', docKind: 'QUOTE', subject: 'quote', body: 'q' },
      { id: 'c', purpose: 'SEND', language: 'sk', docKind: 'INVOICE', subject: 'gone', body: 'x', deleted: true }
    ];
    expect(pickTemplate(own, { purpose: 'SEND', language: 'sk', docKind: 'QUOTE' }).id).toBe('b');
    expect(pickTemplate(own, { purpose: 'SEND', language: 'sk', docKind: 'INVOICE' }).id).toBe('a');
    expect(pickTemplate(own, { purpose: 'SEND', language: 'de', docKind: 'INVOICE' }).subject).toBe('{kind} Nr. {number} von {company}');
  });
  it('has a default for every purpose in every print language', () => {
    for (const lang of ['sk', 'cs', 'en', 'de']) {
      for (const p of ['SEND', 'REMINDER_0', 'REMINDER_1', 'REMINDER_2', 'REMINDER_3', 'THANK_YOU']) {
        const tpl = defaultTemplate(p, lang);
        expect(tpl.subject).toBeTruthy();
        expect(tpl.body).toContain('{company}');
      }
    }
    expect(mailLanguage('ru')).toBe('sk');
    expect(fill('{a} {b}', { a: 1 })).toBe('1 {b}');
  });
});

describe('placeholders', () => {
  it('formats amounts, dates and the period in the mail language', () => {
    const v = documentVars({ document: invoice({ periodFrom: '2026-10-01', periodTo: '2026-10-31' }), company, language: 'sk', today: '2026-10-20' });
    expect(v).toMatchObject({ kind: 'Faktúra', number: '2026001', company: 'Alfa s. r. o.', contact: 'Beta', vs: '2026001', iban: 'SK31 1200 0000 1987 4263 7541', daysOverdue: '5' });
    expect(v.amount.replace(/\s/g, ' ')).toBe('615,00 €');
    expect(v.dueDate).toBe(formatMailDate('2026-10-15', 'sk'));
    expect(v.period).toBe('október 2026');
    expect(documentVars({ document: invoice(), company, language: 'de', today: '2026-10-01' }).kind).toBe('Rechnung');
    expect(periodLabel('2026-10-01', '2026-12-31', 'en')).toContain(' - ');
    expect(periodLabel(null, null, 'sk')).toBe('');
  });
  it('subtracts payments for the amount due', () => {
    const v = documentVars({ document: invoice({ payments: [{ id: 'p', date: '2026-10-02', amount: '115', method: 'TRANSFER', source: 'MANUAL' }] }), company, language: 'en', today: '2026-10-01' });
    expect(v.amountDue).toBe('€500.00');
  });
});

describe('composeMail', () => {
  it('takes the recipients from the contact and the language of the document', () => {
    const m = composeMail({ document: invoice(), company, contact, today: '2026-10-05' });
    expect(m).toMatchObject({ to: ['inv@beta.sk'], cc: ['acc@beta.sk'], bcc: [], language: 'en', purpose: 'SEND' });
    expect(m.subject).toBe('Invoice No. 2026001 from Alfa s. r. o.');
    expect(m.body).toContain('variable symbol 2026001');
  });
  it('uses the reminder address, the blind copy and the language printed on the document', () => {
    const m = composeMail({ document: invoice({ language: 'cs' }), company: { ...company, mailSettings: { bccSelf: true } }, contact, purpose: 'REMINDER_1', today: '2026-10-20', penalties: 'P' });
    expect(m).toMatchObject({ to: ['pay@beta.sk'], cc: [], bcc: ['alfa@alfa.sk'], language: 'cs' });
    expect(m.subject).toBe('Upomínka: faktura č. 2026001 je po splatnosti');
    expect(m.body).toContain('\nP\n');
  });
  it('falls back to the buyer e-mail and the company language', () => {
    const m = composeMail({ document: invoice({ contactId: null }), company, contact: null, today: '2026-10-05' });
    expect(m.to).toEqual(['buyer@beta.sk']);
    expect(m.language).toBe('sk');
    expect(documentLanguage({}, null, null)).toBe('sk');
    expect(mailSettings(null)).toEqual({ bccSelf: false, ccAccountant: true, replyTo: null });
  });
  it('splits and checks addresses', () => {
    expect(splitAddresses('a@x.sk; b@x.sk, a@x.sk')).toEqual(['a@x.sk', 'b@x.sk']);
    expect(invalidAddresses(['a@x.sk', 'nope'])).toEqual(['nope']);
  });
});

describe('mailtoUrl', () => {
  it('encodes recipients, subject and CRLF line breaks', () => {
    const url = mailtoUrl({ to: ['a@x.sk'], cc: ['c@x.sk'], subject: 'Faktúra č. 1', body: 'Ahoj\nsvet' });
    expect(url).toBe('mailto:a%40x.sk?cc=c%40x.sk&subject=Fakt%C3%BAra%20%C4%8D.%201&body=Ahoj%0D%0Asvet');
  });
  it('shortens a long body to fit the limit', () => {
    const url = mailtoUrl({ to: ['a@x.sk'], subject: 's', body: 'ď'.repeat(5000) }, 1000);
    expect(url.length).toBeLessThanOrEqual(1000);
    expect(() => decodeURIComponent(url.split('body=')[1])).not.toThrow();
  });
});

describe('send log', () => {
  it('marks an issued document as sent on its first sending only', () => {
    const entry = sendLogEntry({ to: ['a@x.sk'], result: 'SENT', purpose: 'SEND', at: '2026-10-05T10:00:00.000Z' });
    expect(entry).toEqual({ at: '2026-10-05T10:00:00.000Z', channel: 'EMAIL', to: 'a@x.sk', result: 'SENT', detail: 'SEND' });
    expect(sendPatch(invoice(), entry)).toMatchObject({ status: 'SENT', sendLog: [entry] });
    expect(sendPatch(invoice({ status: 'PAID' }), entry).status).toBeUndefined();
    expect(sendPatch(invoice(), { ...entry, detail: 'REMINDER_1' }).status).toBeUndefined();
    expect(sendPatch(invoice(), { ...entry, result: 'FAILED' }).status).toBeUndefined();
  });
});

function memoryStore(doc) {
  const docs = new Map([[doc.id, doc]]);
  return {
    get: (c, id) => docs.get(id) || null,
    update: vi.fn(async (c, id, patch) => { const next = { ...docs.get(id), ...patch }; docs.set(id, next); return next; }),
    doc: () => docs.get(doc.id)
  };
}

describe('sendDocumentMail', () => {
  const message = { to: ['inv@beta.sk'], cc: [], bcc: [], subject: 'S', body: 'B', purpose: 'SEND', replyTo: null };
  const pdf = async () => ({ fileName: 'Faktura_2026001.pdf', blob: new Uint8Array([37, 80, 68, 70]) });

  it('sends through SMTP with the PDF attached', async () => {
    setDesktopPref('smtp', { host: 'smtp.alfa.sk', port: 587, security: 'starttls', user: 'u', from: 'alfa@alfa.sk', fromName: '' });
    const win = { weMail: { send: vi.fn(async () => ({ ok: true, messageId: 'm1' })) } };
    expect(smtpAccount(win).host).toBe('smtp.alfa.sk');
    const store = memoryStore(invoice());
    const { entry } = await sendDocumentMail({ store, document: invoice(), company, message, transport: {}, win, pdf, now: () => '2026-10-05T10:00:00.000Z' });
    expect(entry.result).toBe('SENT');
    const [, sent] = win.weMail.send.mock.calls[0];
    expect(sent.attachments[0]).toMatchObject({ filename: 'Faktura_2026001.pdf', contentType: 'application/pdf' });
    expect(store.doc().status).toBe('SENT');
  });

  it('logs a failed SMTP delivery and passes the error on', async () => {
    setDesktopPref('smtp', { host: 'smtp.alfa.sk', port: 587, security: 'starttls', user: 'u', from: 'alfa@alfa.sk', fromName: '' });
    const win = { weMail: { send: async () => ({ error: { code: 'MAIL_AUTH' } }) } };
    const store = memoryStore(invoice());
    await expect(sendDocumentMail({ store, document: invoice(), company, message, transport: {}, win, pdf })).rejects.toMatchObject({ code: 'MAIL_AUTH' });
    expect(store.doc().sendLog.map(e => e.result)).toEqual(['FAILED']);
    expect(store.doc().status).toBe('ISSUED');
  });

  it('downloads the PDF and opens the mail program without SMTP', async () => {
    const saveAs = vi.fn(async () => true);
    const openUrl = vi.fn();
    const store = memoryStore(invoice());
    const { entry, url } = await sendDocumentMail({ store, document: invoice(), company, message, transport: { files: { saveAs } }, win: {}, pdf, openUrl });
    expect(saveAs).toHaveBeenCalledWith('Faktura_2026001.pdf', expect.anything());
    expect(openUrl).toHaveBeenCalledWith(url);
    expect(url.startsWith('mailto:inv%40beta.sk?')).toBe(true);
    expect(entry.result).toBe('CLIENT_OPENED');
    expect(store.doc().status).toBe('SENT');
  });

  it('refuses automatic sending without SMTP and bad recipients', async () => {
    const store = memoryStore(invoice());
    await expect(sendDocumentMail({ store, document: invoice(), company, message, transport: {}, win: {}, pdf, allowClient: false })).rejects.toMatchObject({ code: 'MAIL_NO_SMTP' });
    await expect(sendDocumentMail({ store, document: invoice(), company, message: { ...message, to: ['bad'] }, transport: {}, win: {}, pdf })).rejects.toMatchObject({ code: 'MAIL_BAD_RECIPIENT' });
    await expect(sendDocumentMail({ store, document: invoice(), company, message: { ...message, to: [] }, transport: {}, win: {}, pdf })).rejects.toMatchObject({ code: 'MAIL_BAD_RECIPIENT' });
  });
});

describe('sendAutomatically', () => {
  it('adds the company as a blind copy for recurring invoices and needs SMTP', async () => {
    const { sendAutomatically } = await import('./index.js');
    const store = { ...memoryStore(invoice()), company: () => company, list: () => [] };
    store.get = (c, id) => (c === 'contacts' ? contact : store.doc());
    expect(await sendAutomatically({ store, document: invoice(), win: {} })).toBe(null);
    setDesktopPref('smtp', { host: 'smtp.alfa.sk', port: 587, security: 'starttls', user: 'u', from: 'alfa@alfa.sk', fromName: '' });
    const win = { weMail: { send: vi.fn(async () => ({ ok: true })) } };
    const pdf = async () => ({ fileName: 'f.pdf', blob: new Uint8Array([1]) });
    const entry = await sendAutomatically({ store, document: invoice(), win, pdf, copyToSelf: true, transport: {} });
    expect(entry.result).toBe('SENT');
    expect(win.weMail.send.mock.calls[0][1]).toMatchObject({ to: ['inv@beta.sk'], bcc: ['alfa@alfa.sk'] });
  });
});
