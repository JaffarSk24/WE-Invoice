// WE Invoice entry point: fonts, styles, preferences, language, theme, the
// shell and the router. Views are registered here; work packages replace
// the placeholders with their own render functions.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/outfit/600.css';
import '@fontsource/outfit/700.css';
import '@fontsource/outfit/800.css';
import './ui/tokens.css';
import './style/base.css';
import './style/shell.css';
import './style/components.css';
import { setLanguage, translatePage, t } from './i18n/index.js';
import { getPrefs, setPref } from './prefs.js';
import { setTheme, setDensity } from './ui/theme.js';
import { initModalKeys } from './ui/modal.js';
import { showError, showToast } from './ui/toast.js';
import { registerRoute, startRouter, currentRoute, navigate, routeRender } from './router.js';
import { renderShell, renderMore } from './views/shell/shell.js';
import { renderPlaceholder } from './views/shell/placeholder.js';
import { ALL_ROUTES } from './views/shell/nav.js';
import { getTransport } from './transport/index.js';
import { registerServiceWorker } from './sw-register.js';
import { bootModules } from './boot/index.js';
import { on, emit } from './events.js';

ALL_ROUTES.forEach(route => registerRoute(route, (root) => renderPlaceholder(root, route)));
registerRoute('more', renderMore);

const app = document.getElementById('app');

function draw(route, render) {
  const prefs = getPrefs();
  const main = renderShell(app, {
    active: route,
    prefs,
    onLanguage: async (code) => { setPref('language', code); await setLanguage(code); emit('language:changed', code); draw(currentRoute(), routeRender(currentRoute())); },
    onTheme: (theme) => { setPref('theme', theme); setTheme(theme); }
  });
  try {
    const view = render || (() => {});
    view(main, route);
  } catch (e) {
    showError(e);
  }
  translatePage();
  setPref('lastView', route);
}

async function start() {
  const prefs = getPrefs();
  setTheme(prefs.theme);
  setDensity(prefs.density);
  await setLanguage(prefs.language);
  const transport = getTransport();
  initModalKeys();
  await bootModules({ registerRoute, transport, t, showToast, showError, navigate, on, emit },
    (name, e) => { console.error(`Module ${name} did not start`, e); showError(e); });
  window.addEventListener('unhandledrejection', (e) => showError(e.reason));
  startRouter({ defaultRoute: 'dashboard', onChange: draw });
  registerServiceWorker();
}

start().catch(e => console.error('Start failed', e));
