// Device-local interface preferences: language, theme, table density, last
// view. They are not business data and never sync; business data lives in
// the store (WP-SYNC). A storage that throws (private mode) only means the
// preference is not remembered.

const KEY = 'we-invoice-prefs';
const DEFAULTS = Object.freeze({ language: null, theme: 'system', density: 'comfortable', lastView: null });

let cache = null;

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return { ...DEFAULTS, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch (e) {
    console.warn('Preferences could not be read', e);
    return { ...DEFAULTS };
  }
}

export function getPrefs() {
  if (!cache) cache = read();
  return { ...cache };
}

export function setPref(name, value) {
  cache = { ...getPrefs(), [name]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch (e) {
    console.warn('Preferences could not be saved', e);
  }
  return getPrefs();
}

// For tests: forget the cached copy.
export function resetPrefsCache() {
  cache = null;
}
