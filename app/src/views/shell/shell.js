// The application frame: sidebar (desktop), bottom bar with FAB (phone),
// the main area that views render into. The onboarding route gets a bare
// frame: no menu until there is a company to use it with.
import { h, clear } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { renderSidebar, navList, companySwitcher } from './sidebar.js';
import { renderBottomBar } from './bottom-bar.js';
import { promoFooter } from './promo.js';

const BARE_ROUTES = new Set(['onboarding']);

// Renders the frame into `root` and returns the element views draw into.
export function renderShell(root, { active, prefs, onLanguage, onTheme }) {
  clear(root);
  root.dataset.route = active;
  root.dataset.bare = BARE_ROUTES.has(active) ? 'true' : 'false';
  const main = h('main', { class: 'main', id: 'main', tabindex: '-1' });
  root.append(h('a', { class: 'skip-link', href: '#main', onclick: (e) => { e.preventDefault(); main.focus(); } }, t('shell.skipToContent')));
  if (!BARE_ROUTES.has(active)) root.append(renderSidebar({ active, prefs, onLanguage, onTheme }));
  root.append(main);
  if (!BARE_ROUTES.has(active)) root.append(promoFooter(), ...renderBottomBar(active));
  refreshIcons(root);
  return main;
}

// The phone "More" screen: the company switch (the menu with its own is
// hidden on phones) and the full navigation as a list.
export function renderMore(root) {
  root.append(h('header', { class: 'view-header' }, h('h1', {}, t('nav.more'))), companySwitcher({ id: 'more-company-switcher' }), navList(null), promoFooter({ inline: true }));
  refreshIcons(root);
}
