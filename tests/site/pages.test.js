// Every language page exists, has the same structure as the Slovak one,
// declares its language, canonical URL and hreflang set, carries the
// structured data and loads scripts only from site/assets.
import { describe, it, expect } from 'vitest';
import { SITE_URL } from '../../site/build/config.js';
import { CODES, PAGES, PAIRS, read, exists, pagePath, sectionIds, hreflangs, canonical, jsonLd, attrValues } from './helpers.js';

const LANDING_SECTIONS = ['hero', 'efaktura', 'features', 'compare', 'privacy', 'connect', 'faq', 'white-eagles'];

describe('language pages', () => {
  it.each(PAIRS)('%s/%s exists', (code, page) => {
    expect(exists(pagePath(code, page))).toBe(true);
  });

  it.each(PAIRS)('%s/%s declares its language, title and description', (code, page) => {
    const html = read(pagePath(code, page));
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain(`<html lang="${code}">`);
    expect(html).toMatch(/<title>[^<]{10,}<\/title>/);
    expect(html).toMatch(/<meta name="description" content="[^"]{40,}">/);
    expect(html).toContain('<meta name="viewport"');
  });

  it.each(CODES)('%s landing has the sections of the specification in order', (code) => {
    expect(sectionIds(read(pagePath(code, 'index.html')))).toEqual(LANDING_SECTIONS);
  });

  it.each(PAIRS)('%s/%s has the same headings count as the Slovak page', (code, page) => {
    const count = (html, tag) => (html.match(new RegExp(`<${tag}[ >]`, 'g')) || []).length;
    const sk = read(pagePath('sk', page));
    const html = read(pagePath(code, page));
    for (const tag of ['h1', 'h2', 'h3', 'details', 'section', 'form', 'table']) expect(count(html, tag), tag).toBe(count(sk, tag));
  });

  it.each(PAIRS)('%s/%s has a canonical URL and a complete hreflang set', (code, page) => {
    const html = read(pagePath(code, page));
    const suffix = page === 'index.html' ? '' : page;
    expect(canonical(html)).toBe(`${SITE_URL}${code}/${suffix}`);
    const links = hreflangs(html);
    expect(links.map(l => l.lang)).toEqual([...CODES, 'x-default']);
    for (const l of links) {
      if (l.lang === 'x-default') expect(l.href).toBe(`${SITE_URL}${suffix}`);
      else expect(l.href).toBe(`${SITE_URL}${l.lang}/${suffix}`);
    }
    expect(html).toContain(`<meta property="og:url" content="${canonical(html)}">`);
    expect(html).toContain(`<meta property="og:image" content="${SITE_URL}assets/og/${code}.png">`);
  });

  it.each(PAIRS)('%s/%s loads scripts only from site/assets, with no inline script', (code, page) => {
    const html = read(pagePath(code, page));
    const scripts = [...html.matchAll(/<script([^>]*)>/g)].map(m => m[1]);
    for (const attrs of scripts) {
      if (/type="application\/ld\+json"/.test(attrs)) continue;
      expect(attrs).toMatch(/^ type="module" src="\.\.\/assets\/[a-z-]+\.js"$/);
    }
    expect(html).not.toMatch(/\son[a-z]+="/);
    expect(html).not.toMatch(/javascript:/);
  });

  it.each(CODES)('%s landing carries SoftwareApplication (price 0) and FAQPage structured data', (code) => {
    const data = jsonLd(read(pagePath(code, 'index.html')));
    const app = data.find(d => d['@type'] === 'SoftwareApplication');
    const faq = data.find(d => d['@type'] === 'FAQPage');
    expect(app.offers.price).toBe('0');
    expect(app.offers.priceCurrency).toBe('EUR');
    expect(app.inLanguage).toBe(code);
    expect(faq.mainEntity.length).toBeGreaterThanOrEqual(8);
    for (const q of faq.mainEntity) expect(q.acceptedAnswer.text.length).toBeGreaterThan(40);
  });

  it.each(CODES)('%s pages switch language to every other language', (code) => {
    for (const page of PAGES) {
      const html = read(pagePath(code, page));
      const targets = attrValues(html, /<li><a href="\.\.\/([a-z]{2})\/[a-z]+\.html" hreflang=/g);
      expect(targets).toEqual(CODES);
      expect(html).toContain(`<a href="../${code}/${page}" hreflang="${code}" lang="${code}" aria-current="page">`);
    }
  });

  it('the comparison table names no competitor', () => {
    const brands = /iDoklad|KROS|SuperFakt|Pohoda|Money S3|Fakturoid|Omega|iKROS/i;
    for (const code of CODES) expect(read(pagePath(code, 'index.html'))).not.toMatch(brands);
  });
});
