// No broken internal link or asset reference anywhere on the site, and the
// sitemap and robots.txt agree with the pages that exist.
import { describe, it, expect } from 'vitest';
import { SITE_URL } from '../../site/build/config.js';
import { CODES, PAGES, PAIRS, read, exists, pagePath, pngSize } from './helpers.js';

const ROOT_PAGES = [...PAGES, '404.html'];

// Relative hrefs and srcs of a page, resolved against its folder.
function internalRefs(html, folder) {
  const refs = [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map(m => m[1]);
  return refs
    .filter(r => !/^(https?:|mailto:|#|data:)/.test(r))
    .map(r => r.replace(/[#?].*$/, ''))
    .filter(Boolean)
    .map(r => new URL(r, `https://x/${folder}`).pathname.slice(1));
}

describe('internal links', () => {
  it.each(PAIRS)('%s/%s links only to files that exist', (code, page) => {
    const html = read(pagePath(code, page));
    for (const ref of internalRefs(html, `site/${code}/`)) {
      // The app is built by Vite into /app/ at publish time.
      if (ref === 'site/app/') continue;
      const target = ref.endsWith('/') ? `${ref}index.html` : ref;
      expect(exists(target), `${ref} from ${code}/${page}`).toBe(true);
    }
  });

  it.each(ROOT_PAGES)('root %s links only to files that exist', (page) => {
    const html = read(`site/${page}`);
    for (const ref of internalRefs(html.replaceAll(SITE_URL, ''), 'site/')) {
      const target = ref.endsWith('/') ? `${ref}index.html` : ref;
      expect(exists(target), ref).toBe(true);
    }
  });

  it.each(ROOT_PAGES.filter(p => p !== '404.html'))('root %s lists every language', (page) => {
    const html = read(`site/${page}`);
    for (const code of CODES) expect(html).toContain(`href="${code}/${page}" hreflang="${code}"`);
    expect(html).toContain(`data-redirect="${page}"`);
  });

  it('sitemap lists every indexed language page and robots points to it', () => {
    const sitemap = read('site/sitemap.xml');
    for (const code of CODES) {
      expect(sitemap).toContain(`<loc>${SITE_URL}${code}/</loc>`);
      expect(sitemap).toContain(`<loc>${SITE_URL}${code}/privacy.html</loc>`);
      expect(sitemap).toContain(`<loc>${SITE_URL}${code}/terms.html</loc>`);
      expect(sitemap).not.toContain(`${code}/thanks.html</loc>`);
      expect(sitemap).not.toContain(`${code}/unsubscribed.html</loc>`);
    }
    const robots = read('site/robots.txt');
    expect(robots).toContain(`Sitemap: ${SITE_URL}sitemap.xml`);
    expect(robots).toContain('Allow: /');
  });

  it.each(CODES)('%s Open Graph image is 1200 x 630', (code) => {
    expect(pngSize(`site/assets/og/${code}.png`)).toEqual({ width: 1200, height: 630 });
  });

  it('the hero picture and the icons exist', () => {
    expect(pngSize('site/assets/preview.png')).toEqual({ width: 1440, height: 900 });
    for (const f of ['favicon.png', 'icon.png', 'apple-touch-icon.png']) expect(exists(`site/assets/${f}`)).toBe(true);
  });
});
