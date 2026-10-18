// The waitlist form of every language sends exactly what the gateway
// contract expects (gateway/openapi.yaml, POST /v1/waitlist), and the form
// script maps it without any text of its own.
import { describe, it, expect } from 'vitest';
import { WAITLIST_URL } from '../../site/build/config.js';
import { readForm, outcome } from '../../site/assets/waitlist.js';
import { CODES, read, pagePath } from './helpers.js';

const INTERESTS = ['efaktura-send', 'efaktura-receive', 'simple-bookkeeping', 'vat-reports'];

function form(code) {
  const html = read(pagePath(code, 'index.html'));
  return (html.match(/<form class="waitlist"[\s\S]*?<\/form>/) || [''])[0];
}

describe('waitlist form', () => {
  it.each(CODES)('%s form has every field of the contract', (code) => {
    const f = form(code);
    expect(f).toContain(`action="${WAITLIST_URL}"`);
    expect(f).toContain('method="post"');
    expect(f).toContain('<input id="wl-email" name="email" type="email" required');
    expect(f).toContain(`<input type="hidden" name="lang" value="${code}">`);
    expect(f).toContain('<input type="hidden" name="startedAt" value="">');
    for (const v of INTERESTS) expect(f).toContain(`<input type="checkbox" name="interests" value="${v}">`);
    expect(f).toContain('<input type="radio" name="vatPayer" value="true">');
    expect(f).toContain('<input type="radio" name="vatPayer" value="false">');
    expect(f).toContain('<input type="checkbox" name="consent" value="true" required>');
    expect(f).toMatch(/<div class="hp" aria-hidden="true">[\s\S]*name="website"[\s\S]*tabindex="-1"/);
    expect(f).toContain('<button type="submit"');
    expect(f).toContain('role="status" aria-live="polite"');
  });

  it.each(CODES)('%s form carries every message in its own language', (code) => {
    const f = form(code);
    for (const key of ['success', 'invalid-email', 'consent', 'rate-limited', 'bad-request', 'network']) {
      expect(f).toMatch(new RegExp(` data-msg-${key}="[^"]{10,}"`));
    }
    expect(f).toMatch(/ data-sending="[^"]{3,}"/);
  });

  it.each(CODES)('%s consent text links to the privacy policy', (code) => {
    expect(form(code)).toMatch(/consent-check[\s\S]*href="\.\/privacy\.html"/);
  });

  it('readForm builds the request body of the contract', () => {
    const data = new Map([['email', ' a@b.sk '], ['lang', 'cs'], ['consent', 'true'], ['source', 'site'], ['vatPayer', 'false'], ['website', ''], ['startedAt', '1700000000000']]);
    const fd = { get: (k) => data.get(k) ?? null, getAll: (k) => (k === 'interests' ? ['efaktura-send', 'vat-reports'] : []) };
    expect(readForm(fd)).toEqual({
      email: 'a@b.sk', lang: 'cs', consent: true, source: 'site',
      interests: ['efaktura-send', 'vat-reports'], vatPayer: false, website: '', startedAt: 1700000000000
    });
  });

  it('readForm sends vatPayer null when nothing is chosen', () => {
    const fd = { get: () => null, getAll: () => [] };
    const body = readForm(fd);
    expect(body.vatPayer).toBeNull();
    expect(body.consent).toBe(false);
    expect(body.startedAt).toBeGreaterThan(0);
  });

  it('outcome maps the gateway statuses to message keys', () => {
    expect(outcome(202)).toBeNull();
    expect(outcome(429)).toBe('rateLimited');
    expect(outcome(400)).toBe('badRequest');
    expect(outcome(500)).toBe('badRequest');
  });
});
