// Shared helpers of the site tests: the list of languages and pages, the
// committed HTML of every page and a few regex-based readers. The pages are
// plain static HTML, so no DOM library is needed.
import { readFileSync, existsSync } from 'node:fs';
import { LANGUAGES, PAGES } from '../../site/build/config.js';

export const ROOT = new URL('../../', import.meta.url);
export const CODES = LANGUAGES.map(l => l.code);
export { PAGES };

export function read(path) {
  return readFileSync(new URL(path, ROOT), 'utf8');
}

export function exists(path) {
  return existsSync(new URL(path, ROOT));
}

export function pagePath(code, page) {
  return `site/${code}/${page}`;
}

// Every (language, page) pair as [code, page] for it.each.
export const PAIRS = CODES.flatMap(code => PAGES.map(page => [code, page]));

export function attrValues(html, re) {
  return [...html.matchAll(re)].map(m => m[1]);
}

// Values of the "id" attribute of <section> elements, in document order.
export function sectionIds(html) {
  return attrValues(html, /<section[^>]*\bid="([^"]+)"/g);
}

export function hreflangs(html) {
  return [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map(m => ({ lang: m[1], href: m[2] }));
}

export function canonical(html) {
  return (html.match(/<link rel="canonical" href="([^"]+)">/) || [])[1];
}

export function jsonLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
}

// Width and height of a PNG from its IHDR chunk.
export function pngSize(path) {
  const buf = readFileSync(new URL(path, ROOT));
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
