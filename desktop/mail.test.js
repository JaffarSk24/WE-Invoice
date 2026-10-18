import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { normalizeSmtpConfig, transportOptions, normalizeMessage, mailErrorCode, MAX_ATTACHMENT_TOTAL } = require('./mail-utils.cjs');
const { createMail, PASSWORD_SECRET } = require('./mail.cjs');

const account = { host: 'SMTP.Example.sk', port: '587', user: 'me@example.sk', from: 'me@example.sk', fromName: 'Me s.r.o.' };

describe('SMTP account', () => {
  it('normalises a valid account and guesses the security from the port', () => {
    const c = normalizeSmtpConfig(account);
    expect(c.ok).toBe(true);
    expect(c.config).toEqual({ host: 'smtp.example.sk', port: 587, security: 'starttls', user: 'me@example.sk', from: 'me@example.sk', fromName: 'Me s.r.o.' });
    expect(normalizeSmtpConfig({ ...account, port: 465 }).config.security).toBe('tls');
    expect(normalizeSmtpConfig({ ...account, security: 'none' }).config.security).toBe('none');
  });

  it('refuses a bad host, port or sender', () => {
    expect(normalizeSmtpConfig({ ...account, host: 'bad host' }).code).toBe('MAIL_BAD_CONFIG');
    expect(normalizeSmtpConfig({ ...account, port: 70000 }).code).toBe('MAIL_BAD_CONFIG');
    expect(normalizeSmtpConfig({ ...account, from: 'nope' }).code).toBe('MAIL_BAD_CONFIG');
    expect(normalizeSmtpConfig(null).ok).toBe(false);
  });

  it('builds nodemailer options with the password from the keychain', () => {
    const o = transportOptions(normalizeSmtpConfig({ ...account, port: 465 }).config, 'pw');
    expect(o).toMatchObject({ host: 'smtp.example.sk', port: 465, secure: true, requireTLS: false, auth: { user: 'me@example.sk', pass: 'pw' } });
    expect(transportOptions(normalizeSmtpConfig({ ...account, user: '' }).config, 'pw').auth).toBe(undefined);
  });
});

describe('message', () => {
  const config = normalizeSmtpConfig(account).config;

  it('normalises recipients, subject, body and attachments', () => {
    const m = normalizeMessage({
      to: 'a@example.sk, b@example.sk', bcc: ['me@example.sk'], subject: ' Faktúra 2026001 ', text: 'Hello',
      attachments: [{ filename: '../FA 2026001.pdf', content: new Uint8Array([1, 2, 3]), contentType: 'application/pdf' }]
    }, config);
    expect(m.ok).toBe(true);
    expect(m.message.from).toEqual({ name: 'Me s.r.o.', address: 'me@example.sk' });
    expect(m.message.to).toEqual(['a@example.sk', 'b@example.sk']);
    expect(m.message.bcc).toEqual(['me@example.sk']);
    expect(m.message.cc).toBe(undefined);
    expect(m.message.subject).toBe('Faktúra 2026001');
    expect(m.message.attachments[0].filename).toBe('.._FA 2026001.pdf');
    expect(Buffer.from(m.message.attachments[0].content)).toEqual(Buffer.from([1, 2, 3]));
  });

  it('accepts base64 attachments and refuses bad or oversized ones', () => {
    expect(normalizeMessage({ to: 'a@example.sk', subject: 's', text: 't', attachments: [{ filename: 'x.txt', content: Buffer.from('hi').toString('base64') }] }, config).ok).toBe(true);
    expect(normalizeMessage({ to: 'a@example.sk', subject: 's', text: 't', attachments: [{ filename: 'x.txt' }] }, config).code).toBe('MAIL_BAD_ATTACHMENT');
    const big = { filename: 'big.bin', content: new Uint8Array(MAX_ATTACHMENT_TOTAL + 1) };
    expect(normalizeMessage({ to: 'a@example.sk', subject: 's', text: 't', attachments: [big] }, config).code).toBe('MAIL_TOO_LARGE');
  });

  it('refuses missing recipients, subject or body', () => {
    expect(normalizeMessage({ subject: 's', text: 't' }, config).code).toBe('MAIL_BAD_RECIPIENT');
    expect(normalizeMessage({ to: 'nope', subject: 's', text: 't' }, config).code).toBe('MAIL_BAD_RECIPIENT');
    expect(normalizeMessage({ to: 'a@example.sk', text: 't' }, config).code).toBe('MAIL_EMPTY');
    expect(normalizeMessage({ to: 'a@example.sk', subject: 's' }, config).code).toBe('MAIL_EMPTY');
  });

  it('maps transport errors to codes', () => {
    expect(mailErrorCode({ code: 'EAUTH' })).toBe('MAIL_AUTH');
    expect(mailErrorCode({ code: 'ECONNECTION' })).toBe('MAIL_CONNECT');
    expect(mailErrorCode({ code: 'EENVELOPE' })).toBe('MAIL_BAD_RECIPIENT');
    expect(mailErrorCode(new Error('x'))).toBe('MAIL_FAILED');
  });
});

describe('weMail', () => {
  function setup(transporter) {
    const store = new Map();
    const secrets = {
      get: (name) => ({ ok: true, value: store.has(name) ? store.get(name) : null }),
      set: (name, value) => { store.set(name, value); return { ok: true, stored: true }; },
      delete: (name) => { store.delete(name); return { ok: true }; }
    };
    const createTransport = vi.fn(() => transporter);
    return { mail: createMail({ secrets, createTransport }), createTransport, store };
  }

  it('sends with the stored password and reports the message id', async () => {
    const transporter = { verify: vi.fn(async () => true), sendMail: vi.fn(async () => ({ messageId: '<1@x>', accepted: ['a@example.sk'] })), close: vi.fn() };
    const { mail, createTransport } = setup(transporter);
    mail.setPassword('secret');
    expect(mail.hasPassword()).toBe(true);
    expect(await mail.test(account)).toEqual({ ok: true });
    const result = await mail.send(account, { to: 'a@example.sk', subject: 's', text: 't' });
    expect(result).toEqual({ ok: true, messageId: '<1@x>', accepted: ['a@example.sk'] });
    expect(createTransport.mock.calls[0][0].auth.pass).toBe('secret');
    expect(transporter.sendMail.mock.calls[0][0].to).toEqual(['a@example.sk']);
    expect(transporter.close).toHaveBeenCalledTimes(2);
    mail.setPassword('');
    expect(mail.hasPassword()).toBe(false);
  });

  it('reports configuration, message and transport errors by code', async () => {
    const transporter = { verify: vi.fn(async () => { throw Object.assign(new Error('auth'), { code: 'EAUTH' }); }), sendMail: vi.fn() };
    const { mail, store } = setup(transporter);
    store.set(PASSWORD_SECRET, 'pw');
    expect((await mail.test({ ...account, host: '' })).error.code).toBe('MAIL_BAD_CONFIG');
    expect((await mail.test(account)).error.code).toBe('MAIL_AUTH');
    expect((await mail.send(account, { to: 'a@example.sk' })).error.code).toBe('MAIL_EMPTY');
    expect(transporter.sendMail).not.toHaveBeenCalled();
  });
});
