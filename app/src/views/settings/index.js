// The Settings screen: a list of sections on the left (a select on the
// phone), the chosen section on the right. #/settings/<section> opens a
// section directly. Sections of other packages come from the registry.
import { h, icon, selectEl } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { routeFromHash } from '../../router.js';
import { SETTINGS_SECTIONS, settingsRenderer, isSettingsSection } from './registry.js';
import { interfaceSection, aboutSection } from './sections.js';

const OWN = { interface: interfaceSection, about: aboutSection };

// The section named after "settings/" in the hash, or the first one.
export function sectionFromHash(hash) {
  const parts = String(hash || '').replace(/^#\/?/, '').split('/');
  if (routeFromHash(hash) !== 'settings') return SETTINGS_SECTIONS[0].id;
  return parts[1] && isSettingsSection(parts[1]) ? parts[1] : SETTINGS_SECTIONS[0].id;
}

function drawSection(panel, id, redraw) {
  while (panel.firstChild) panel.removeChild(panel.firstChild);
  const container = h('div', { class: 'settings-section', id: `settings-${id}`, dataset: { section: id } });
  panel.append(h('h2', { id: `settings-${id}-title`, tabindex: '-1' }, t(`settings.section.${id}`)), container);
  const render = settingsRenderer(id) || OWN[id];
  if (render) {
    try {
      render(container, { redraw });
    } catch (e) {
      console.error(`Settings section ${id} failed`, e);
      container.append(h('p', { class: 'muted' }, t('errors.UNKNOWN')));
    }
  } else {
    container.append(h('p', { class: 'muted' }, t(`settings.section.${id}.text`)), h('p', { class: 'muted small' }, t('placeholder.text')));
  }
  refreshIcons(panel);
}

export function renderSettings(root) {
  let current = sectionFromHash(window.location.hash);
  const panel = h('div', { class: 'settings-panel card' });
  const list = h('nav', { class: 'settings-nav', 'aria-label': t('nav.settings') });
  const select = selectEl(SETTINGS_SECTIONS.map(s => ({ value: s.id, label: t(`settings.section.${s.id}`) })), current, { class: 'settings-select', 'aria-label': t('nav.settings') });

  const redraw = () => {
    while (list.firstChild) list.removeChild(list.firstChild);
    SETTINGS_SECTIONS.forEach(s => list.append(h('a', {
      class: 'nav-item', href: `#/settings/${s.id}`, 'aria-current': s.id === current ? 'page' : null, dataset: { section: s.id },
      onclick: (e) => { e.preventDefault(); open(s.id); }
    }, icon(s.icon), h('span', {}, t(`settings.section.${s.id}`)))));
    select.value = current;
    drawSection(panel, current, redraw);
    refreshIcons(list);
  };
  const open = (id, { focus = true } = {}) => {
    current = id;
    try { window.history.replaceState(null, '', `#/settings/${id}`); } catch (e) { console.warn('Address could not be updated', e); }
    redraw();
    const title = panel.querySelector('h2');
    if (focus && title) title.focus();
  };
  select.addEventListener('change', () => open(select.value));

  root.append(
    h('header', { class: 'view-header' }, h('h1', {}, t('nav.settings'))),
    h('div', { class: 'settings-layout' }, h('div', { class: 'settings-side' }, select, list), panel));
  redraw();
}
