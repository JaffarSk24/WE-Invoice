import { describe, it, expect, vi } from 'vitest';
import { texts, MAIL_KINDS } from '../src/mail/texts/index.js';
import { renderMail, fill } from '../src/mail/render.js';
import { createMailer } from '../src/mail/mailer.js';
import { loadConfig } from '../src/config.js';

const LANGS = ['sk', 'cs', 'en', 'de', 'ru', 'uk'];
const PARAMS = { confirmUrl: 'https://api.test/c?token=T', unsubscribeUrl: 'https://api.test/u?token=U', hours: 48, code: 'AAAA-BBBB-CCCC', appUrl: 'https://site.test/app/' };

describe('mail texts', () => {
  it.each(LANGS)('%s has both kinds with the same placeholders', (lang) => {
    for (const kind of MAIL_KINDS) {
      const t = texts[lang][kind];
      expect(t.subject).toBeTruthy();
      expect(t.paragraphs.length).toBeGreaterThan(2);
      const all = [t.subject, ...t.paragraphs, t.signature, t.footer].join('\n');
      const placeholders = (all.match(/\{\w+\}/g) || []).sort();
      const reference = [texts.sk[kind].subject, ...texts.sk[kind].paragraphs, texts.sk[kind].signature, texts.sk[kind].footer].join('\n').match(/\{\w+\}/g).sort();
      expect(placeholders).toEqual(reference);
      expect(all).not.toMatch(new RegExp(`[${String.fromCharCode(0x2013, 0x2014, 0xa0)}]`));
    }
  });

  it('renders text and html with escaping and links', () => {
    const m = renderMail('confirm', 'sk', PARAMS);
    expect(m.subject).toBe('Potvrďte svoj e-mail pre WE Invoice');
    expect(m.text).toContain('https://api.test/c?token=T');
    expect(m.text).toContain('48 hodín');
    expect(m.html).toContain('<a href="https://api.test/c?token=T">');
    expect(m.headers['List-Unsubscribe']).toBe('<https://api.test/u?token=U>');
    const evil = renderMail('invite', 'en', { ...PARAMS, code: '<b>x</b>' });
    expect(evil.html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(evil.text).toContain('<b>x</b>');
    expect(renderMail('invite', 'xx', PARAMS).subject).toBe(texts.en.invite.subject);
    expect(renderMail('invite', 'sk', {}).headers).toEqual({});
    expect(() => renderMail('nope', 'sk', PARAMS)).toThrow();
    expect(fill('a {x} {y}', { x: 1 })).toBe('a 1 {y}');
  });
});

describe('mailer', () => {
  it('uses the given transport and the from address', async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    const mailer = createMailer(loadConfig({ SMTP_FROM: 'WE Invoice <hello@whiteeagles.sk>' }), { transport: { sendMail } });
    expect(mailer.configured).toBe(true);
    expect(await mailer.send('confirm', 'cs', 'a@b.cz', PARAMS)).toEqual({ sent: true });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: 'WE Invoice <hello@whiteeagles.sk>', to: 'a@b.cz', subject: texts.cs.confirm.subject }));
  });

  it('builds an SMTP transport from the configuration and skips sending without one', async () => {
    const smtp = createMailer(loadConfig({ SMTP_HOST: 'smtp.test', SMTP_PORT: '465', SMTP_USER: 'u', SMTP_PASS: 'p' }));
    expect(smtp.configured).toBe(true);
    const none = createMailer(loadConfig({}), { log: { warn: vi.fn() } });
    expect(none.configured).toBe(false);
    expect(await none.send('confirm', 'sk', 'a@b.sk', PARAMS)).toEqual({ sent: false });
  });
});
