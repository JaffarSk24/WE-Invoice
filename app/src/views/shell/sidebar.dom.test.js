// @vitest-environment happy-dom
// The sidebar between routes: favourite sections pinned on top with their
// star, and the scroll position kept when the frame is drawn again.
import { describe, it, expect, beforeEach } from 'vitest';
import { renderShell } from './shell.js';
import { resetPrefsCache, getPrefs } from '../../prefs.js';
import { resetCompanyState } from './company-state.js';
import { t } from '../../i18n/index.js';

const frame = (root, active) => renderShell(root, { active, prefs: getPrefs(), onLanguage: () => {}, onTheme: () => {} });
const groupTitles = (root) => [...root.querySelectorAll('.sidebar .nav-group-title')].map(e => e.textContent);

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  resetPrefsCache();
  resetCompanyState();
});

describe('sidebar', () => {
  it('pins a section to the favourites on top and takes it off again', () => {
    const root = document.createElement('div');
    document.body.append(root);
    frame(root, 'dashboard');
    expect(groupTitles(root)).not.toContain(t('nav.group.favourites'));
    root.querySelector('.sidebar [data-favourite="bank"]').click();
    expect(groupTitles(root)[0]).toBe(t('nav.group.favourites'));
    const title = [...root.querySelectorAll('.sidebar .nav-group-title')][0];
    const first = title.nextElementSibling;
    expect(first.querySelector('.nav-item').dataset.route).toBe('bank');
    expect(root.querySelector('.sidebar .nav .nav-row .nav-item').dataset.route).toBe('dashboard');
    expect(first.querySelector('.nav-star').getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelectorAll('.sidebar [data-route="bank"]')).toHaveLength(2);
    frame(root, 'invoices');
    expect(groupTitles(root)[0]).toBe(t('nav.group.favourites'));
    root.querySelector('.sidebar .nav-row.is-favourite .nav-star').click();
    expect(groupTitles(root)).not.toContain(t('nav.group.favourites'));
    expect(root.querySelectorAll('.sidebar [data-route="bank"]')).toHaveLength(1);
  });

  it('keeps the scroll of the menu when the next route draws the frame', () => {
    const root = document.createElement('div');
    document.body.append(root);
    frame(root, 'dashboard');
    root.querySelector('.sidebar').scrollTop = 420;
    frame(root, 'bank');
    expect(root.querySelector('.sidebar').scrollTop).toBe(420);
  });
});
