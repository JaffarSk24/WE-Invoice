// The interface languages (07-ui-ux-i18n.md § 7.5). This file is the only
// place that knows which languages exist: plain data plus small pure
// helpers, ported from WE Budget.
//
//   code     key in prefs.language and the name of the dictionary file
//   name     native name, shown in the language picker
//   locale   BCP 47 locale for Intl (dates, numbers, money)
//   decimal  the decimal separator shown in amounts; input accepts both
//   load     the dictionary, loaded on first use as its own chunk. Slovak
//            (the reference) and English (the fallback) are bundled.
export const LANGUAGES = [
  { code: 'sk', name: 'Slovenčina', english: 'Slovak', locale: 'sk-SK', decimal: ',' },
  { code: 'cs', name: 'Čeština', english: 'Czech', locale: 'cs-CZ', decimal: ',', load: () => import('./cs.js') },
  { code: 'en', name: 'English', english: 'English', locale: 'en-GB', decimal: '.' },
  { code: 'de', name: 'Deutsch', english: 'German', locale: 'de-DE', decimal: ',', load: () => import('./de.js') },
  { code: 'ru', name: 'Русский', english: 'Russian', locale: 'ru-RU', decimal: ',', load: () => import('./ru.js') },
  { code: 'uk', name: 'Українська', english: 'Ukrainian', locale: 'uk-UA', decimal: ',', load: () => import('./uk.js') }
];

export const DEFAULT_LANGUAGE = 'sk';
export const FALLBACK_LANGUAGE = 'en';

const BY_CODE = new Map(LANGUAGES.map(l => [l.code, l]));

export function isRegistered(code) {
  return BY_CODE.has(code);
}

// Unknown codes get Slovak, so a helper never throws on old or foreign data.
export function languageInfo(code) {
  return BY_CODE.get(code) || BY_CODE.get(DEFAULT_LANGUAGE);
}

export const localeOf = (code) => languageInfo(code).locale;
export const decimalOf = (code) => languageInfo(code).decimal;

export function languageOptions() {
  return LANGUAGES.map(l => ({ value: l.code, label: l.name }));
}

// The first browser language ("sk-SK", "de-AT") whose primary subtag is one
// of ours; null when none is.
export function matchBrowserLanguage(list = []) {
  for (const tag of list || []) {
    const code = String(tag || '').toLowerCase().split(/[-_]/)[0];
    if (BY_CODE.has(code)) return code;
  }
  return null;
}

// The saved language when it is ours, otherwise the browser's, otherwise SK.
export function resolveLanguage(saved, browserLanguages = []) {
  if (isRegistered(saved)) return saved;
  return matchBrowserLanguage(browserLanguages) || DEFAULT_LANGUAGE;
}
