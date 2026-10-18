// Interface text comes only from dictionaries: a string literal with
// Slovak or Czech letters in app code outside the dictionaries is
// hardcoded interface text.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { repoFiles } from './repo-files.js';

const DIACRITICS = /(['"`])[^'"`\n]*[áäčďéíĺľňóôŕšťúýžěřůÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽĚŘŮ][^'"`\n]*\1/;
const appCode = repoFiles().filter(f => /^app\/src\/.*\.js$/.test(f) && !f.startsWith('app/src/i18n/') && !f.endsWith('.test.js'));

describe('no hardcoded interface text', () => {
  it.each(appCode)('%s', (path) => {
    const bad = readFileSync(path, 'utf8').split('\n')
      .map((line, i) => (DIACRITICS.test(line) && !line.trim().startsWith('//') ? `${i + 1}: ${line.trim().slice(0, 80)}` : null))
      .filter(Boolean);
    expect(bad).toEqual([]);
  });
});
