// The 260 px sidebar of wide screens: logo, the brand "New invoice" button,
// the navigation groups (tax items filtered by the company's modes), and at
// the bottom the company switcher, the sync status, language and theme.
import { h, icon, selectEl, append } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t, currentLang } from '../../i18n/index.js';
import { languageOptions } from '../../i18n/languages.js';
import { visibleNav } from './nav.js';
import { navigate } from '../../router.js';
import { emit } from '../../events.js';
import { APP_VERSION } from '../../config.js';
import { currentCompany, companyList, requestSwitch } from './company-state.js';
import { syncState, syncIcon, syncTextKey } from './sync-state.js';

export const THEMES = Object.freeze(['system', 'light', 'dark']);
const ADD_COMPANY = '__add__';

export function navLink(item, active) {
  return h('a', {
    class: 'nav-item', href: `#/${item.route}`, 'aria-current': item.route === active ? 'page' : null, dataset: { route: item.route }
  }, icon(item.icon), h('span', {}, t(item.label)));
}

// The navigation list, used by the sidebar and by the phone "More" screen.
export function navList(active, { withBadges = true } = {}) {
  const nav = h('nav', { class: 'nav', 'aria-label': t('nav.main') });
  visibleNav(currentCompany()).forEach(group => {
    if (group.title) {
      append(nav, [h('div', { class: 'nav-group-title' }, t(group.title),
        withBadges && group.beta ? h('span', { class: 'nav-badge' }, t('common.beta')) : null)]);
    }
    group.items.forEach(item => nav.append(navLink(item, active)));
  });
  return nav;
}

// The options of the company switcher: every company plus "add".
export function companyOptions(companies, current) {
  const options = companies.map(c => ({ value: c.id, label: c.name || t('shell.company.unnamed') }));
  if (current && !companies.some(c => c.id === current.id)) options.unshift({ value: current.id, label: current.name || t('shell.company.unnamed') });
  if (!options.length) options.push({ value: '', label: t('shell.company.none') });
  options.push({ value: ADD_COMPANY, label: t('shell.company.add') });
  return options;
}

// The company select of the menu; the phone's More screen has its own copy.
export function companySwitcher({ id = 'company-switcher' } = {}) {
  const current = currentCompany();
  const sel = selectEl(companyOptions(companyList(), current), current ? current.id : '', {
    'aria-label': t('shell.company.label'), id, class: 'company-switcher'
  });
  sel.addEventListener('change', () => {
    if (sel.value === ADD_COMPANY) { sel.value = current ? current.id : ''; navigate('onboarding'); return; }
    if (sel.value && (!current || sel.value !== current.id)) requestSwitch(sel.value);
  });
  return h('div', { class: 'company-row' }, icon('building-2'), sel);
}

export function syncStatusLine() {
  const st = syncState();
  return h('button', {
    type: 'button', class: `sync-status sync-${st.status}`, id: 'sync-status', title: st.message || null,
    onclick: () => navigate('settings/sync')
  }, icon(syncIcon(st.status)), h('span', {}, t(syncTextKey(st.status))));
}

// Updates the status line in place, so a sync event does not redraw the page.
export function refreshSyncStatus() {
  const el = document.getElementById('sync-status');
  if (!el) return;
  const fresh = syncStatusLine();
  el.replaceWith(fresh);
  refreshIcons(fresh.parentNode || fresh);
}

export function refreshNav(active) {
  const old = document.querySelector('.sidebar .nav');
  if (old) {
    const fresh = navList(active);
    old.replaceWith(fresh);
    refreshIcons(fresh);
  }
  ['company-switcher', 'more-company-switcher'].forEach(id => {
    const sw = document.getElementById(id);
    if (!sw) return;
    const fresh = companySwitcher({ id });
    sw.parentNode.replaceWith(fresh);
    refreshIcons(fresh);
  });
}

export function renderSidebar({ active, prefs, onLanguage, onTheme }) {
  const lang = selectEl(languageOptions(), currentLang(), { 'aria-label': t('shell.language'), id: 'pref-language' });
  lang.addEventListener('change', () => onLanguage(lang.value));
  const theme = selectEl(THEMES.map(v => ({ value: v, label: t(`theme.${v}`) })), prefs.theme, { 'aria-label': t('shell.theme'), id: 'pref-theme' });
  theme.addEventListener('change', () => onTheme(theme.value));
  const aside = h('aside', { class: 'sidebar' },
    h('a', { class: 'logo', href: '#/dashboard' }, h('span', { class: 'logo-mark' }, icon('file-text')), h('span', { class: 'logo-text' }, t('app.name'))),
    h('button', {
      class: 'btn btn-brand btn-new', type: 'button', id: 'btn-new-invoice',
      onclick: () => { navigate('invoices'); emit('document:new', { kind: 'INVOICE' }); }
    }, icon('plus'), t('nav.newInvoice')),
    navList(active),
    h('div', { class: 'sidebar-footer' },
      companySwitcher(),
      syncStatusLine(),
      h('div', { class: 'prefs-row' }, lang, theme),
      h('div', { class: 'app-version' }, t('shell.version', { version: APP_VERSION }))));
  return aside;
}
