// The phone bottom bar: Overview, Documents, + (FAB with a menu), Purchases,
// More. The FAB menu is a real menu for the keyboard: arrows move, Escape
// closes, focus returns to the button.
import { h, icon, append } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { BOTTOM_BAR, FAB_ACTIONS } from './nav.js';
import { navigate } from '../../router.js';
import { emit } from '../../events.js';

export function renderBottomBar(active) {
  const menu = h('div', { class: 'fab-menu', id: 'fab-menu', dataset: { open: 'false' }, role: 'menu', 'aria-label': t('fab.title') });
  let fab = null;
  const backdrop = h('div', { class: 'fab-backdrop', dataset: { open: 'false' }, 'aria-hidden': 'true' });
  const setOpen = (open) => {
    menu.dataset.open = open ? 'true' : 'false';
    backdrop.dataset.open = open ? 'true' : 'false';
    fab.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      const first = menu.querySelector('[role="menuitem"]');
      if (first) first.focus();
    }
  };
  FAB_ACTIONS.forEach(a => menu.append(h('button', {
    class: 'nav-item', role: 'menuitem', type: 'button', dataset: { action: a.id },
    onclick: () => { setOpen(false); navigate(a.route); emit('fab:action', { id: a.id }); }
  }, icon(a.icon), h('span', {}, t(a.label)))));
  menu.addEventListener('keydown', (e) => {
    const items = Array.from(menu.querySelectorAll('[role="menuitem"]'));
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); fab.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  });
  const bar = h('nav', { class: 'bottom-bar', 'aria-label': t('nav.main') });
  BOTTOM_BAR.forEach(item => {
    if (item.fab) {
      fab = h('button', {
        class: 'fab', type: 'button', 'aria-label': t('fab.title'), 'aria-haspopup': 'menu', 'aria-controls': 'fab-menu', 'aria-expanded': 'false',
        onclick: () => setOpen(menu.dataset.open !== 'true')
      }, icon('plus'));
      bar.append(fab);
    } else {
      append(bar, [h('a', {
        class: 'bottom-item', href: `#/${item.route}`, 'aria-current': item.route === active ? 'page' : null
      }, icon(item.icon), h('span', {}, t(item.label)))]);
    }
  });
  backdrop.addEventListener('click', () => setOpen(false));
  return [backdrop, menu, bar];
}
