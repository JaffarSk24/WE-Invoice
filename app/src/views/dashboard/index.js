// The Overview screen (03-features.md § 3.2): a grid of widgets the user
// can move (buttons or drag and drop) and hide; order and visibility are
// kept on the device. Widgets draw from the dashboard data source.
import { h, icon, append } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { getPrefs, setPref } from '../../prefs.js';
import { openModal } from '../../ui/modal.js';
import { navigate } from '../../router.js';
import { emit, on } from '../../events.js';
import { todayLocal } from '../../components/dates.js';
import { emptyState } from '../../components/empty-state.js';
import { currentCompany } from '../shell/company-state.js';
import { promoFooter } from '../shell/promo.js';
import { loadDraft } from '../onboarding/state.js';
import { WIDGETS, normalizeLayout, visibleWidgets, moveWidget, placeWidget, hideWidget, showWidget } from './layout.js';
import { dashboardData } from './data.js';
import { issuedWidget, unpaidWidget, topClientsWidget, topDebtorsWidget, balanceWidget, accountsWidget } from './widgets-money.js';
import { quickActionsWidget, vatThresholdWidget, taxCalendarWidget, efakturyWidget } from './widgets-other.js';

const RENDER = {
  quickActions: quickActionsWidget, issued: issuedWidget, unpaid: unpaidWidget, vatThreshold: vatThresholdWidget, taxCalendar: taxCalendarWidget,
  topClients: topClientsWidget, topDebtors: topDebtorsWidget, balance: balanceWidget, efaktury: efakturyWidget, accounts: accountsWidget
};
const WIDE = new Set(['quickActions', 'unpaid', 'taxCalendar']);

export function loadLayout() {
  return normalizeLayout(getPrefs().dashboardLayout);
}

export function saveLayout(layout) {
  setPref('dashboardLayout', layout);
  return layout;
}

function widgetCard(id, ctx, { layout, onLayout }) {
  const visible = visibleWidgets(layout);
  const index = visible.indexOf(id);
  const body = h('div', { class: 'widget-body' });
  try {
    body.append(RENDER[id](ctx));
  } catch (e) {
    console.error(`Widget ${id} failed`, e);
    body.append(h('p', { class: 'muted' }, t('errors.UNKNOWN')));
  }
  const card = h('section', {
    class: `widget card ${WIDE.has(id) ? 'widget-wide' : ''}`.trim(), dataset: { widget: id }, 'aria-labelledby': `widget-${id}-title`, draggable: 'true'
  },
  h('header', { class: 'widget-head' },
    h('h2', { id: `widget-${id}-title` }, t(`dashboard.widget.${id}`)),
    h('div', { class: 'widget-tools' },
      h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm widget-move', 'aria-label': t('dashboard.moveLeft'), disabled: index <= 0, onclick: () => onLayout(moveWidget(layout, id, -1)) }, icon('chevron-left')),
      h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm widget-move', 'aria-label': t('dashboard.moveRight'), disabled: index >= visible.length - 1, onclick: () => onLayout(moveWidget(layout, id, 1)) }, icon('chevron-right')),
      h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': t('dashboard.hide'), onclick: () => onLayout(hideWidget(layout, id)) }, icon('x')))),
  body);
  card.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; card.classList.add('is-dragging'); });
  card.addEventListener('dragend', () => card.classList.remove('is-dragging'));
  card.addEventListener('dragover', (e) => { e.preventDefault(); card.classList.add('is-drop'); });
  card.addEventListener('dragleave', () => card.classList.remove('is-drop'));
  card.addEventListener('drop', (e) => {
    e.preventDefault();
    card.classList.remove('is-drop');
    const dragged = e.dataTransfer.getData('text/plain');
    if (dragged && WIDGETS.includes(dragged)) onLayout(placeWidget(layout, dragged, id));
  });
  return card;
}

function openWidgetPicker(layout, onLayout) {
  const checks = WIDGETS.map(id => {
    const input = h('input', { type: 'checkbox', checked: !layout.hidden.includes(id), id: `widget-pick-${id}` });
    return { id, input, el: h('label', { class: 'checkbox-label column-choice', for: `widget-pick-${id}` }, input, h('span', {}, t(`dashboard.widget.${id}`))) };
  });
  openModal({
    title: t('dashboard.widgets'),
    body: h('div', { class: 'column-picker' }, checks.map(c => c.el)),
    actions: [
      { label: t('common.cancel'), onClick: (m) => m.close() },
      { label: t('common.save'), kind: 'primary', onClick: (m) => { let next = layout; checks.forEach(c => { next = c.input.checked ? showWidget(next, c.id) : hideWidget(next, c.id); }); onLayout(next); m.close(); } }
    ]
  });
}

let unsubscribe = [];

export function renderDashboard(root) {
  unsubscribe.forEach(off => off());
  unsubscribe = [];
  const grid = h('div', { class: 'dashboard-grid' });
  let layout = loadLayout();

  const draw = () => {
    const data = dashboardData();
    const ctx = { ...data, company: currentCompany(), today: todayLocal(), navigate, emit };
    while (grid.firstChild) grid.removeChild(grid.firstChild);
    if (data.empty && !currentCompany()) {
      grid.append(emptyState({
        title: t('dashboard.empty.title'), text: t('dashboard.empty.text'), iconName: 'layout-dashboard',
        actionLabel: loadDraft() ? t('dashboard.empty.resume') : t('dashboard.empty.action'), onAction: () => navigate('onboarding'), brand: true
      }));
    } else {
      visibleWidgets(layout).forEach(id => grid.append(widgetCard(id, ctx, { layout, onLayout })));
    }
    refreshIcons(root);
  };
  const onLayout = (next) => { layout = saveLayout(next); draw(); };

  append(root, [
    h('header', { class: 'view-header' },
      h('h1', {}, t('nav.dashboard')),
      h('div', { class: 'view-actions' },
        dashboardData().demo ? h('span', { class: 'badge badge-demo' }, t('dashboard.demoBadge')) : null,
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => openWidgetPicker(layout, onLayout) }, icon('layout-grid'), t('dashboard.widgets')))),
    grid, promoFooter({ inline: true })]);
  draw();
  ['data:changed', 'company:switched', 'demo:enabled', 'demo:disabled'].forEach(ev => unsubscribe.push(on(ev, () => { if (grid.isConnected) draw(); })));
}
