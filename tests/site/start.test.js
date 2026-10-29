// eFaktura is open to everyone: the landing page of every language sends
// the visitor to the app with three short steps instead of a sign-up form,
// and nothing on the site points to the old waiting list any more.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadContent } from '../../site/build/content.js';
import { repoFiles, TEXT_FILE } from '../repo-files.js';
import { CODES, read, exists, pagePath } from './helpers.js';

function panel(code) {
  const html = read(pagePath(code, 'index.html'));
  return (html.match(/<div class="start" id="start">[\s\S]*?\n\s*<\/div>/) || [''])[0];
}

describe('turning eFaktura on', () => {
  it.each(CODES)('%s landing has no form and no form script', (code) => {
    const html = read(pagePath(code, 'index.html'));
    expect(html).not.toMatch(/<form[\s>]/);
    expect(html).not.toMatch(/<input[\s>]/);
    expect(html).not.toContain('invoice-api.whiteeagles.sk');
    expect(html).not.toMatch(/src="[^"]*waitlist/);
  });

  it.each(CODES)('%s eFaktura block opens the app and lists three steps', (code) => {
    const p = panel(code);
    expect(p).not.toBe('');
    expect((p.match(/<li>/g) || []).length).toBe(3);
    expect(p).toMatch(/<a class="btn primary" href="\.\.\/app\/">[^<]{10,}<\/a>/);
    expect(p).toMatch(/<p class="note">[^<]{60,}<\/p>/);
    const section = read(pagePath(code, 'index.html')).match(/<section class="block efaktura" id="efaktura">[\s\S]*?<\/section>/)[0];
    expect(section).toContain('<div class="start" id="start">');
  });

  it.each(CODES)('%s steps name the eFaktura settings and the price note says the provider charges', (code) => {
    const { start } = loadContent(code).landing.efaktura;
    expect(start.steps).toHaveLength(3);
    expect(start.intro).toContain('Beta');
    expect(start.steps.join(' ')).toMatch(/eFaktúra|E-invoicing/);
    expect(start.price.length).toBeGreaterThan(60);
  });

  it('the pages of the old sign-up flow are gone', () => {
    for (const page of ['thanks.html', 'unsubscribed.html']) {
      expect(exists(`site/${page}`)).toBe(false);
      for (const code of CODES) expect(exists(pagePath(code, page))).toBe(false);
    }
    expect(exists('site/assets/waitlist.js')).toBe(false);
  });
});

// Words of the old closed beta: waiting list, invitations, sign-up waves.
const OLD_FLOW = [
  /waitlist/i, /waiting list/i, /\binvit/i, /pozvánk/i, /pozvánek/i, /poradovník/i, /čakateľ/i, /čekatel/i,
  /warteliste/i, /einladung/i, /лист[аы]? ожидания/i, /списо?к[аеу]? ожидания/i, /приглашени/i,
  /список очікування/i, /списку очікування/i, /запрошен/i, /mailgun/i,
  /closed beta/i, /uzavretej bet/i, /uzavřené bet/i, /geschlossene[nr]? beta/i, /закрыт\S* бет/i, /закрит\S* бет/i
];

describe('no trace of the waiting list on the site', () => {
  const files = repoFiles()
    .filter(f => (f.startsWith('site/') || f.startsWith('docs/whiteeagles-apps-block/')) && TEXT_FILE.test(f))
    .filter(f => exists(f));

  it.each(files)('%s', (path) => {
    const lines = readFileSync(new URL(path, new URL('../../', import.meta.url)), 'utf8').split('\n');
    const bad = [];
    lines.forEach((line, i) => OLD_FLOW.forEach(re => { if (re.test(line)) bad.push(`${i + 1}: ${re}`); }));
    expect(bad).toEqual([]);
  });
});
