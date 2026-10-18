// Pure helpers of the app shell: language resolution, theme, routes.
import { describe, it, expect } from 'vitest';
import { resolveLanguage, matchBrowserLanguage, LANGUAGES } from './i18n/languages.js';
import { resolveTheme } from './ui/theme.js';
import { routeFromHash } from './router.js';
import { ALL_ROUTES, NAV, BOTTOM_BAR } from './views/shell/nav.js';
import { sk } from './i18n/sk.js';

describe('languages', () => {
  it('has the six interface languages', () => {
    expect(LANGUAGES.map(l => l.code)).toEqual(['sk', 'cs', 'en', 'de', 'ru', 'uk']);
  });

  it('uses the saved language, then the browser, then Slovak', () => {
    expect(resolveLanguage('de', ['en-US'])).toBe('de');
    expect(resolveLanguage(null, ['fr-FR', 'cs-CZ'])).toBe('cs');
    expect(resolveLanguage('xx', ['fr-FR'])).toBe('sk');
    expect(matchBrowserLanguage(['uk-UA'])).toBe('uk');
  });
});

describe('theme', () => {
  it('follows the system unless chosen', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
  });
});

describe('navigation', () => {
  it('reads the route from the hash', () => {
    expect(routeFromHash('#/invoices')).toBe('invoices');
    expect(routeFromHash('#/invoices/123')).toBe('invoices');
    expect(routeFromHash('')).toBe(null);
  });

  it('every route and label exists', () => {
    expect(new Set(ALL_ROUTES).size).toBe(ALL_ROUTES.length);
    NAV.forEach(g => {
      if (g.title) expect(sk[g.title], g.title).toBeTruthy();
      g.items.forEach(i => expect(sk[i.label], i.label).toBeTruthy());
    });
    BOTTOM_BAR.filter(b => !b.fab).forEach(b => expect(ALL_ROUTES).toContain(b.route));
  });
});
