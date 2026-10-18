// Dictionary checks (07-ui-ux-i18n.md § 7.5).
//   Always: English has every Slovak key (it is the fallback); no language
//   has a key Slovak does not have; placeholders match; no empty texts; a
//   key lives in one part only.
//   Release (I18N_STRICT=1): Czech, German, Russian and Ukrainian have every
//   Slovak key too. Until then a missing translation is listed as a warning:
//   feature packages add keys to sk and en, the translation package fills
//   the other four.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { LANGUAGES } from '../app/src/i18n/languages.js';

const STRICT = process.env.I18N_STRICT === '1';
const placeholders = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(',');

async function load(code) {
  return import(`../app/src/i18n/${code}/index.js`);
}

describe('interface dictionaries', async () => {
  const mods = {};
  for (const { code } of LANGUAGES) mods[code] = await load(code);
  const reference = mods.sk.sk;
  const keys = Object.keys(reference).sort();
  const codes = LANGUAGES.map(l => l.code);

  it('English has every Slovak key', () => {
    expect(keys.filter(k => !(k in mods.en.en))).toEqual([]);
  });

  it.each(codes)('%s has no key that Slovak does not have', (code) => {
    expect(Object.keys(mods[code][code]).filter(k => !(k in reference))).toEqual([]);
  });

  it.each(codes)('%s has no empty texts and the same placeholders as Slovak', (code) => {
    const dict = mods[code][code];
    const bad = Object.keys(dict).filter(k => !String(dict[k]).trim() || placeholders(dict[k]) !== placeholders(reference[k]));
    expect(bad).toEqual([]);
  });

  it.each(codes)('%s defines each key in one part only', (code) => {
    const seen = new Map();
    const dupes = [];
    Object.entries(mods[code].parts).forEach(([part, dict]) => {
      Object.keys(dict).forEach(k => { if (seen.has(k)) dupes.push(`${k} (${seen.get(k)}, ${part})`); else seen.set(k, part); });
    });
    expect(dupes).toEqual([]);
  });

  it.each(codes.filter(c => c !== 'sk' && c !== 'en'))('%s has every Slovak key (strict in release)', (code) => {
    const missing = keys.filter(k => !(k in mods[code][code]));
    if (STRICT) expect(missing).toEqual([]);
    else if (missing.length) console.warn(`[i18n] ${code}: ${missing.length} keys not translated yet`);
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
