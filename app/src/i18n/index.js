// Interface texts. A key is looked up in the current language, then in
// English, then the key itself is shown: a missing key is visible, not
// silent. {name} placeholders are filled from params. Ported from WE Budget;
// keys are named by screen: "nav.invoices", "invoice.editor.addLine".
import { sk } from './sk/index.js';
import { en } from './en/index.js';
import { LANGUAGES, FALLBACK_LANGUAGE, resolveLanguage, localeOf } from './languages.js';
import { applyPlurals } from './plural.js';

export const translations = { sk, en };
const loading = new Map();
let current = null;
const listeners = new Set();

function browserLanguages() {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
}

export function currentLang() {
  return current || resolveLanguage(null, browserLanguages());
}

export function isLanguageLoaded(code) {
  return Boolean(translations[code]);
}

// Loads a dictionary once. Resolves true when it is there; a language that
// fails to load keeps showing English.
export function ensureLanguage(code) {
  if (isLanguageLoaded(code)) return Promise.resolve(true);
  const info = LANGUAGES.find(l => l.code === code);
  if (!info || !info.load) return Promise.resolve(false);
  if (!loading.has(code)) {
    loading.set(code, info.load()
      .then(mod => { translations[code] = mod[code]; return true; })
      .catch(e => { console.error(`Language ${code} could not be loaded`, e); loading.delete(code); return false; }));
  }
  return loading.get(code);
}

// Switches the language once its dictionary is loaded and tells listeners.
export async function setLanguage(saved) {
  const code = resolveLanguage(saved, browserLanguages());
  await ensureLanguage(code);
  current = code;
  listeners.forEach(fn => fn(code));
  return code;
}

export function onLanguageChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function t(key, params = null) {
  const dict = translations[currentLang()] || translations[FALLBACK_LANGUAGE];
  let s = dict[key] ?? translations[FALLBACK_LANGUAGE][key] ?? key;
  if (params) {
    s = applyPlurals(s, params, localeOf(dict[key] !== undefined ? currentLang() : FALLBACK_LANGUAGE));
    s = s.replace(/\{(\w+)\}/g, (m, name) => (params[name] !== undefined ? String(params[name]) : m));
  }
  return s;
}

// Fills every [data-i18n] element of a static page part with its text.
export function translatePage(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.getAttribute('data-i18n')); });
  root.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.getAttribute('data-i18n-title')); });
  root.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
  document.documentElement.lang = currentLang();
}
