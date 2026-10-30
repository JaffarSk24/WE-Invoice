// Release notes (docs/release-notes/<version>.md) become the text of the
// GitHub release, and the desktop update window shows the section in the
// language of the app (app/src/desktop/update-popup.js, notesFor). From
// 0.1.7 on every release carries all six languages, each with its items.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { NOTES_LANGUAGES } from '../app/src/desktop/update-popup.js';

const DIR = new URL('../docs/release-notes/', import.meta.url);
const version = (name) => name.replace(/\.md$/, '').split('.').map(Number);
const newer = (v, than) => v[0] - than[0] || v[1] - than[1] || v[2] - than[2];
const FILES = readdirSync(DIR).filter(f => /^\d+\.\d+\.\d+\.md$/.test(f) && newer(version(f), [0, 1, 6]) > 0);

describe('release notes', () => {
  it('names the six languages of the app', () => {
    expect(Object.values(NOTES_LANGUAGES).sort()).toEqual(['cs', 'de', 'en', 'ru', 'sk', 'uk']);
  });

  it.each(FILES.length ? FILES : [null])('%s has a section with items in every language', (file) => {
    if (!file) return;
    const text = readFileSync(new URL(file, DIR), 'utf8');
    for (const name of Object.keys(NOTES_LANGUAGES)) {
      const start = text.indexOf(`\n## ${name}\n`);
      expect(start, `${file}: ## ${name}`).toBeGreaterThanOrEqual(0);
      const rest = text.slice(start + name.length + 5);
      const section = rest.split(/\n## /)[0];
      expect(section, `${file}: items of ${name}`).toMatch(/^- \S/m);
    }
  });
});
