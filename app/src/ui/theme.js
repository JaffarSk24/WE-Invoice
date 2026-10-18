// Light, dark or system theme and table density, applied as data
// attributes on <html>. "system" follows the OS and reacts when it changes.

let media = null;
let mode = 'system';

export function resolveTheme(pref, systemDark) {
  if (pref === 'light' || pref === 'dark') return pref;
  return systemDark ? 'dark' : 'light';
}

function systemDark() {
  return typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)').matches : true;
}

function apply() {
  const theme = resolveTheme(mode, systemDark());
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#090b11' : '#f8fafc');
}

export function setTheme(pref) {
  mode = pref || 'system';
  apply();
  if (!media && typeof matchMedia === 'function') {
    media = matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', () => { if (mode === 'system') apply(); });
  }
}

export function setDensity(density) {
  document.documentElement.dataset.density = density === 'compact' ? 'compact' : 'comfortable';
}
