// The site scripts: language detection for the root redirect and the
// consent configuration. Pure parts only; the DOM behaviour is covered by
// the e2e test tests/e2e/site.spec.js.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { matchBrowserLanguage, resolveLanguage } from '../../site/assets/site.js';
import { GA4_MEASUREMENT_ID, LANGUAGES, DEFAULT_LANGUAGE } from '../../site/assets/config.js';
import { LANGUAGES as BUILD_LANGUAGES } from '../../site/build/config.js';
import { ROOT } from './helpers.js';

describe('root redirect', () => {
  it('matches the first browser language the site has', () => {
    expect(matchBrowserLanguage(['fr-FR', 'de-AT', 'en'])).toBe('de');
    expect(matchBrowserLanguage(['uk-UA'])).toBe('uk');
    expect(matchBrowserLanguage(['fr', 'it'])).toBeNull();
    expect(matchBrowserLanguage([])).toBeNull();
  });

  it('prefers the saved choice, then the browser, then Slovak', () => {
    expect(resolveLanguage('cs', ['en'])).toBe('cs');
    expect(resolveLanguage(null, ['en-US'])).toBe('en');
    expect(resolveLanguage('xx', ['fr'])).toBe(DEFAULT_LANGUAGE);
  });

  it('knows the same languages as the build', () => {
    expect(LANGUAGES).toEqual(BUILD_LANGUAGES.map(l => l.code));
  });
});

describe('analytics', () => {
  it('has no measurement id yet, so nothing loads', () => {
    expect(GA4_MEASUREMENT_ID).toBe('');
  });

  it('starts with every consent type denied and loads GA only after consent', () => {
    const src = readFileSync(new URL('site/assets/consent.js', ROOT), 'utf8');
    expect(src).toMatch(/gtag\('consent', 'default', \{ \.\.\.DENIED/);
    for (const key of ['ad_storage', 'ad_user_data', 'ad_personalization', 'analytics_storage']) expect(src).toContain(`${key}: 'denied'`);
    expect(src).toMatch(/if \(loaded \|\| !GA4_MEASUREMENT_ID\) return;/);
  });
});
