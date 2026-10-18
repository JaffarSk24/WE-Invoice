// The application frame: sidebar (desktop), bottom bar with FAB (phone),
// the main area that views render into, language and theme pickers.
import { h, icon, clear, selectEl } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t, currentLang } from '../../i18n/index.js';
import { languageOptions } from '../../i18n/languages.js';
import { NAV, BOTTOM_BAR, FAB_ACTIONS } from './nav.js';
import { navigate } from '../../router.js';
import { APP_VERSION } from '../../config.js';

const THEMES = ['system', 'light', 'dark'];

function navLink(item, active) {
  return h('a', {
    class: 'nav-item', href: `#/${item.route}`, 'aria-current': item.route === active ? 'page' : null, dataset: { route: item.route }
  }, icon(item.icon), h('span', {}, t(item.label)));
}

function sidebar({ active, prefs, onLanguage, onTheme }) {
  const nav = h('nav', { class: 'nav', 'aria-label': t('nav.main') });
  NAV.forEach(group => {
    if (group.title) {
      nav.append(h('div', { class: 'nav-group-title' }, t(group.title), group.beta ? h('span', { class: 'nav-badge' }, t('common.beta')) : null));
    }
    group.items.forEach(item => nav.append(navLink(item, active)));
  });
  const lang = selectEl(languageOptions(), currentLang(), { 'aria-label': t('shell.language'), id: 'pref-language' });
  lang.addEventListener('change', () => onLanguage(lang.value));
  const theme = selectEl(THEMES.map(v => ({ value: v, label: t(`theme.${v}`) })), prefs.theme, { 'aria-label': t('shell.theme'), id: 'pref-theme' });
  theme.addEventListener('change', () => onTheme(theme.value));
  return h('aside', { class: 'sidebar' },
    h('a', { class: 'logo', href: '#/dashboard' }, h('span', { class: 'logo-mark' }, icon('file-text')), h('span', { class: 'logo-text' }, t('app.name'))),
    h('button', { class: 'btn btn-brand btn-new', type: 'button', onclick: () => navigate('invoices') }, icon('plus'), t('nav.newInvoice')),
    nav,
    h('div', { class: 'sidebar-footer' },
      h('div', { class: 'prefs-row' }, lang, theme),
      h('a', { class: 'promo', href: 'https://whiteeagles.sk/', target: '_blank', rel: 'noopener' }, t('footer.promo')),
      h('div', { class: 'app-version' }, t('shell.version', { version: APP_VERSION }))));
}

function bottomBar(active) {
  const menu = h('div', { class: 'fab-menu', id: 'fab-menu', dataset: { open: 'false' }, role: 'menu' });
  FAB_ACTIONS.forEach(a => menu.append(h('a', { class: 'nav-item', role: 'menuitem', href: `#/${a.route}` }, icon(a.icon), h('span', {}, t(a.label)))));
  menu.addEventListener('click', () => { menu.dataset.open = 'false'; });
  const bar = h('nav', { class: 'bottom-bar', 'aria-label': t('nav.main') });
  BOTTOM_BAR.forEach(item => {
    if (item.fab) {
      bar.append(h('button', {
        class: 'fab', type: 'button', 'aria-label': t('fab.title'), 'aria-haspopup': 'menu', 'aria-controls': 'fab-menu',
        onclick: () => { menu.dataset.open = menu.dataset.open === 'true' ? 'false' : 'true'; }
      }, icon('plus')));
    } else {
      bar.append(h('a', { class: 'bottom-item', href: `#/${item.route}`, 'aria-current': item.route === active ? 'page' : null }, icon(item.icon), h('span', {}, t(item.label))));
    }
  });
  return [menu, bar];
}

// Renders the frame into `root` and returns the element views draw into.
export function renderShell(root, { active, prefs, onLanguage, onTheme }) {
  clear(root);
  const main = h('main', { class: 'main', id: 'main', tabindex: '-1' });
  root.append(
    h('a', { class: 'skip-link', href: '#main', onclick: (e) => { e.preventDefault(); main.focus(); } }, t('shell.skipToContent')),
    sidebar({ active, prefs, onLanguage, onTheme }),
    main,
    ...bottomBar(active));
  refreshIcons(root);
  return main;
}

// The phone "Viac" screen: the full navigation as a list.
export function renderMore(root) {
  const list = h('div', { class: 'nav' });
  NAV.forEach(group => {
    if (group.title) list.append(h('div', { class: 'nav-group-title' }, t(group.title)));
    group.items.forEach(item => list.append(navLink(item, null)));
  });
  root.append(h('header', { class: 'view-header' }, h('h1', {}, t('nav.more'))), list);
}
