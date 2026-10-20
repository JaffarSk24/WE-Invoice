// Shared behaviour of every page: remembers the language the visitor picks
// in the switcher, and on the root chooser pages redirects to that language,
// else to the browser's language, else to Slovak.
import { LANGUAGES, DEFAULT_LANGUAGE, LANGUAGE_KEY } from './config.js';

function readSaved() {
  try { return localStorage.getItem(LANGUAGE_KEY); } catch { return null; }
}

function save(code) {
  try { localStorage.setItem(LANGUAGE_KEY, code); } catch { /* private mode: nothing to remember */ }
}

export function matchBrowserLanguage(list) {
  for (const tag of list || []) {
    const code = String(tag || '').toLowerCase().split(/[-_]/)[0];
    if (LANGUAGES.includes(code)) return code;
  }
  return null;
}

export function resolveLanguage(saved, browserLanguages) {
  if (LANGUAGES.includes(saved)) return saved;
  return matchBrowserLanguage(browserLanguages) || DEFAULT_LANGUAGE;
}

function rememberSwitches() {
  document.querySelectorAll('nav.langs a[hreflang]').forEach(a => {
    a.addEventListener('click', () => save(a.getAttribute('hreflang')));
  });
  document.querySelectorAll('.lang-list a[hreflang]').forEach(a => {
    a.addEventListener('click', () => save(a.getAttribute('hreflang')));
  });
}

function redirectFromRoot() {
  const page = document.body.dataset.redirect;
  if (!page) return;
  const code = resolveLanguage(readSaved(), navigator.languages || [navigator.language]);
  location.replace(`${code}/${page === 'index.html' ? '' : page}${location.hash}`);
}

if (typeof document !== 'undefined') {
  rememberSwitches();
  redirectFromRoot();
}
