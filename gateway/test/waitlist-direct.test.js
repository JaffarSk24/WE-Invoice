// Direct sign-up (the default): no e-mail to the applicant, the record is
// "received" at once and the owner gets a notice to answer personally.
import { describe, it, expect, afterEach } from 'vitest';
import { createTestApp } from './helpers.js';
import { mailgunTransport, createMailer } from '../src/mail/mailer.js';
import { loadConfig } from '../src/config.js';
import { localDateTime } from '../src/lib/time.js';

let ctx;
afterEach(async () => { if (ctx) await ctx.app.close(); ctx = null; });

const body = (extra = {}) => ({ email: 'Jana@Example.sk', lang: 'sk', consent: true, source: 'landing', interests: ['efaktura-send'], vatPayer: true, startedAt: Date.now() - 10000, ...extra });
const direct = (extra = {}) => ({ WAITLIST_CONFIRM_EMAIL: 'false', OWNER_NOTIFY_EMAIL: 'owner@example.sk', ...extra });

describe('direct waitlist sign-up', () => {
  it('stores the sign-up at once and sends only a notice to the owner', async () => {
    ctx = await createTestApp({ env: direct() });
    const res = await ctx.app.inject({ method: 'POST', url: '/v1/waitlist', payload: body() });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ status: 'received' });
    expect(ctx.app.deps.waitlist.all()).toEqual([expect.objectContaining({ email: 'jana@example.sk', status: 'received', interests: ['efaktura-send'], vatPayer: true })]);
    expect(ctx.sent).toHaveLength(1);
    const notice = ctx.sent[0];
    expect(notice.to).toBe('owner@example.sk');
    expect(notice.replyTo).toBe('jana@example.sk');
    expect(notice.subject).toBe('Лист ожидания WE Invoice: jana@example.sk');
    expect(notice.text).toContain('Плательщик НДС: да');
    expect(notice.text).toContain('В листе ожидания: 1 чел.');
    expect(notice.html).toContain('E-mail: jana@example.sk<br>');
  });

  it('does not notify twice for the same address and keeps a confirmed status', async () => {
    ctx = await createTestApp({ env: direct({ OWNER_NOTIFY_LANG: 'en' }) });
    await ctx.app.inject({ method: 'POST', url: '/v1/waitlist', payload: body() });
    const res = await ctx.app.inject({ method: 'POST', url: '/v1/waitlist', payload: body({ lang: 'en', interests: ['vat-reports'] }) });
    expect(res.json()).toEqual({ status: 'received' });
    expect(ctx.sent).toHaveLength(1);
    expect(ctx.sent[0].subject).toBe('WE Invoice waitlist: jana@example.sk');
    expect(ctx.app.deps.waitlist.all()).toEqual([expect.objectContaining({ lang: 'en', interests: ['vat-reports'], status: 'received' })]);
  });

  it('keeps the sign-up when the notice fails or no owner address is set', async () => {
    ctx = await createTestApp({ env: direct(), failMail: true });
    let res = await ctx.app.inject({ method: 'POST', url: '/v1/waitlist', payload: body() });
    expect(res.statusCode).toBe(202);
    expect(ctx.app.deps.waitlist.counts()).toEqual({ received: 1 });
    await ctx.app.close();
    ctx = await createTestApp({ env: direct({ OWNER_NOTIFY_EMAIL: '' }) });
    res = await ctx.app.inject({ method: 'POST', url: '/v1/waitlist', payload: body() });
    expect(res.statusCode).toBe(202);
    expect(ctx.sent).toHaveLength(0);
  });

  it('answers a bot like a person and stores nothing', async () => {
    ctx = await createTestApp({ env: direct() });
    const res = await ctx.app.inject({ method: 'POST', url: '/v1/waitlist', payload: body({ website: 'http://spam.test' }) });
    expect(res.json()).toEqual({ status: 'received' });
    expect(ctx.sent).toHaveLength(0);
    expect(ctx.app.deps.waitlist.all()).toEqual([]);
  });
});

describe('Mailgun transport', () => {
  it('posts the message to the EU API with basic auth and a Reply-To', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200 }; };
    const config = loadConfig({ MAILGUN_API_KEY: 'key-test', MAILGUN_DOMAIN: 'mg.example.sk', SMTP_FROM: 'WE <w@mg.example.sk>' });
    const mailer = createMailer(config, { fetchImpl });
    expect(mailer.configured).toBe(true);
    await mailer.send('ownerNew', 'en', 'owner@example.sk', { email: 'a@b.sk', lang: 'sk', interests: '-', vatPayer: '-', source: '-', time: '19.10.2026 01:00', total: 3 }, { replyTo: 'a@b.sk' });
    expect(calls[0].url).toBe('https://api.eu.mailgun.net/v3/mg.example.sk/messages');
    expect(calls[0].init.headers.Authorization).toBe(`Basic ${Buffer.from('api:key-test').toString('base64')}`);
    const sent = calls[0].init.body;
    expect(sent.get('to')).toBe('owner@example.sk');
    expect(sent.get('from')).toBe('WE <w@mg.example.sk>');
    expect(sent.get('h:Reply-To')).toBe('a@b.sk');
    expect(sent.get('subject')).toBe('WE Invoice waitlist: a@b.sk');
  });

  it('reports a refusal and refuses an unknown endpoint', async () => {
    const t = mailgunTransport({ apiKey: 'k', domain: 'd', endpoint: 'api.mailgun.net' }, { fetchImpl: async () => ({ ok: false, status: 401 }) });
    await expect(t.sendMail({ from: 'a', to: 'b', subject: 's', text: 't' })).rejects.toMatchObject({ code: 'MAILGUN_401' });
    expect(() => mailgunTransport({ apiKey: 'k', domain: 'd', endpoint: 'evil.example' })).toThrow(/Unknown Mailgun endpoint/);
  });
});

describe('local time for people', () => {
  it('formats Bratislava time, also across midnight in UTC', () => {
    expect(localDateTime(new Date('2026-10-18T22:30:00Z'))).toBe('19.10.2026 00:30');
    expect(localDateTime(new Date('2026-01-15T08:05:00Z'))).toBe('15.01.2026 09:05');
  });
});
