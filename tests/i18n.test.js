// Dictionary completeness (07-ui-ux-i18n.md § 7.5): every language has
// exactly the keys of Slovak, no empty texts, and the same {placeholders}.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { LANGUAGES } from '../app/src/i18n/languages.js';

const placeholders = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(',');

async function dictionaries() {
  const out = {};
  for (const { code } of LANGUAGES) {
    const mod = await import(`../app/src/i18n/${code}.js`);
    out[code] = mod[code];
  }
  return out;
}

describe('interface dictionaries', async () => {
  const dicts = await dictionaries();
  const reference = dicts.sk;
  const keys = Object.keys(reference).sort();

  it.each(LANGUAGES.map(l => l.code))('%s has every key of sk and no other', (code) => {
    expect(Object.keys(dicts[code]).sort()).toEqual(keys);
  });

  it.each(LANGUAGES.map(l => l.code))('%s has no empty texts and the same placeholders', (code) => {
    const bad = keys.filter(k => !String(dicts[code][k]).trim() || placeholders(dicts[code][k]) !== placeholders(reference[k]));
    expect(bad).toEqual([]);
  });

  it('keys are named by screen with dots', () => {
    expect(keys.filter(k => !/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_]+)+$/.test(k))).toEqual([]);
  });
});

describe('print dictionaries', () => {
  const dir = new URL('../app/src/i18n/print/', import.meta.url);
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  const read = (f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
  const keys = Object.keys(read('sk.json')).sort();

  it('exist for sk, cs, en and de', () => {
    expect(files.sort()).toEqual(['cs.json', 'de.json', 'en.json', 'sk.json']);
  });

  it.each(files)('%s has every key of sk.json', (f) => {
    expect(Object.keys(read(f)).sort()).toEqual(keys);
  });
});
