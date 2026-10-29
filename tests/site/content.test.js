// The texts of the six languages have the same shape, and the languages
// with a space before the unit (sk, cs, de) follow their norm in the
// source texts.
import { describe, it, expect } from 'vitest';
import { loadContent, PARTS } from '../../site/build/content.js';
import { CODES, read } from './helpers.js';

const content = Object.fromEntries(CODES.map(c => [c, loadContent(c)]));

// The structure of a JSON value: keys and array lengths, not the texts.
function shape(value) {
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, shape(value[k])]));
  return typeof value;
}

function strings(value, out = []) {
  if (Array.isArray(value)) value.forEach(v => strings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach(v => strings(v, out));
  else if (typeof value === 'string') out.push(value);
  return out;
}

const links = (s) => (s.match(/\]\(([^)]+)\)/g) || []).sort().join(' ');

describe('site texts', () => {
  it.each(CODES)('%s has the same structure as Slovak', (code) => {
    for (const part of PARTS) expect(shape(content[code][part]), part).toEqual(shape(content.sk[part]));
  });

  it.each(CODES)('%s has no empty text', (code) => {
    for (const part of PARTS) expect(strings(content[code][part]).filter(s => !s.trim())).toEqual([]);
  });

  it.each(CODES)('%s keeps the links of the Slovak text', (code) => {
    for (const part of PARTS) {
      const own = strings(content[code][part]).map(links).join('|');
      const sk = strings(content.sk[part]).map(links).join('|');
      expect(own, part).toBe(sk);
    }
  });

  it.each(['sk', 'cs', 'de'])('%s writes a space between a number and the unit', (code) => {
    const bad = [];
    for (const part of PARTS) strings(content[code][part]).forEach(s => { if (/\d(€|%)/.test(s)) bad.push(s); });
    expect(bad).toEqual([]);
  });

  it.each(CODES)('%s pages keep the number and the unit together', (code) => {
    const html = read(`site/${code}/index.html`).replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
    expect(html).not.toMatch(/\d (€|%)/);
    expect(html).toMatch(/\d&nbsp;€/);
  });
});
