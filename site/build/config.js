// Fixed facts of the site build: where the site and the app are published,
// which languages exist and in what order, external links. Everything that
// a template or a test needs to agree on lives here.
export const SITE_URL = 'https://jaffarsk24.github.io/WE-Invoice/';
export const APP_URL = `${SITE_URL}app/`;
export const GITHUB_URL = 'https://github.com/JaffarSk24/WE-Invoice';
export const RELEASES_URL = `${GITHUB_URL}/releases/latest`;
export const LICENSE_URL = `${GITHUB_URL}/blob/main/LICENSE`;
export const AGENCY_URL = 'https://whiteeagles.sk/';

export const OTHER_APPS = [
  { name: 'WE Time Tracker', url: 'https://jaffarsk24.github.io/WE-Time-Tracker/' },
  { name: 'WE Budget', url: 'https://jaffarsk24.github.io/WE-Budget/' }
];

// Slovak first: it is the reference text and the default language.
export const LANGUAGES = [
  { code: 'sk', locale: 'sk_SK', hreflang: 'sk' },
  { code: 'cs', locale: 'cs_CZ', hreflang: 'cs' },
  { code: 'en', locale: 'en_GB', hreflang: 'en' },
  { code: 'de', locale: 'de_DE', hreflang: 'de' },
  { code: 'ru', locale: 'ru_RU', hreflang: 'ru' },
  { code: 'uk', locale: 'uk_UA', hreflang: 'uk' }
];
export const DEFAULT_LANGUAGE = 'sk';

// Pages rendered per language, with their file name. All of them are
// listed in the sitemap.
export const PAGES = ['index.html', 'privacy.html', 'terms.html'];

export const SITE_DIR = new URL('../', import.meta.url);
export const CONTENT_DIR = new URL('../content/', import.meta.url);
export const DOCS_BLOCK_DIR = new URL('../../docs/whiteeagles-apps-block/', import.meta.url);
