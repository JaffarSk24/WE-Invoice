// The settings sections this package owns: Interface (language, theme,
// density, demo mode) and About (version, links). The other sections are
// placeholders until their packages register a renderer.
import { h, icon, selectEl, append } from '../../ui/dom.js';
import { t, currentLang, setLanguage } from '../../i18n/index.js';
import { languageOptions } from '../../i18n/languages.js';
import { getPrefs, setPref } from '../../prefs.js';
import { setTheme, setDensity } from '../../ui/theme.js';
import { emit } from '../../events.js';
import { navigate, hasRoute } from '../../router.js';
import { APP_VERSION } from '../../config.js';
import { confirmDialog } from '../../ui/modal.js';
import { isDemo, enableDemo, disableDemo } from '../shell/demo-mode.js';
import { THEMES } from '../shell/sidebar.js';
import { DENSITIES } from '../../components/table.js';

function row(label, control, hint = null) {
  return h('div', { class: 'setting-row' },
    h('div', { class: 'setting-text' }, h('span', { class: 'setting-label' }, label), hint ? h('span', { class: 'setting-hint' }, hint) : null),
    h('div', { class: 'setting-control' }, control));
}

export function interfaceSection(root, { redraw }) {
  const prefs = getPrefs();
  const lang = selectEl(languageOptions(), currentLang(), { id: 'settings-language', 'aria-label': t('shell.language') });
  // The whole screen is drawn again (menu, title), not only this section.
  lang.addEventListener('change', async () => { setPref('language', lang.value); await setLanguage(lang.value); emit('language:changed', lang.value); navigate('settings'); });
  const theme = selectEl(THEMES.map(v => ({ value: v, label: t(`theme.${v}`) })), prefs.theme, { id: 'settings-theme', 'aria-label': t('shell.theme') });
  theme.addEventListener('change', () => { setPref('theme', theme.value); setTheme(theme.value); });
  const density = selectEl(DENSITIES.map(v => ({ value: v, label: t(`table.density.${v}`) })), prefs.density, { id: 'settings-density', 'aria-label': t('table.density') });
  density.addEventListener('change', () => { setPref('density', density.value); setDensity(density.value); });
  const demoBtn = h('button', {
    type: 'button', class: 'btn', id: 'settings-demo', onclick: async () => {
      if (isDemo()) {
        if (await confirmDialog(t('settings.interface.demoOffConfirm'))) { disableDemo(); redraw(); }
      } else {
        enableDemo();
        redraw();
      }
    }
  }, icon(isDemo() ? 'square-x' : 'sparkles'), isDemo() ? t('settings.interface.demoOff') : t('settings.interface.demoOn'));
  root.append(
    row(t('shell.language'), lang),
    row(t('shell.theme'), theme, t('settings.interface.themeHint')),
    row(t('table.density'), density, t('settings.interface.densityHint')),
    row(t('settings.interface.demo'), demoBtn, t('settings.interface.demoHint')));
}

const LINKS = [
  { key: 'settings.about.github', href: 'https://github.com/JaffarSk24/WE-Invoice', icon: 'code' },
  { key: 'settings.about.privacy', href: 'https://jaffarsk24.github.io/WE-Invoice/privacy.html', icon: 'shield-check' },
  { key: 'settings.about.whiteEagles', href: 'https://whiteeagles.sk/', icon: 'globe' }
];

export function aboutSection(root) {
  append(root, [
    row(t('settings.about.version'), h('span', { class: 'num' }, APP_VERSION)),
    row(t('settings.about.updates'), h('span', { class: 'muted', id: 'settings-updates' }, t('settings.about.updatesHint'))),
    // The desktop app registers its own screen (updates, backups, tray).
    hasRoute('desktop') ? row(t('desktop.settings.title'), h('button', { type: 'button', class: 'btn', id: 'settings-desktop', onclick: () => navigate('desktop') }, t('settings.about.desktopSettings'))) : null,
    h('ul', { class: 'about-links' }, LINKS.map(l => h('li', {}, h('a', { href: l.href, target: '_blank', rel: 'noopener' }, icon(l.icon), t(l.key))))),
    h('p', { class: 'muted small' }, t('settings.about.license'))]);
}
