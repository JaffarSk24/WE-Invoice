// The Help screen: every topic in one line, its text opened in place and a
// button to the screen it lives on. #/help/<id> opens a topic directly.
import { h, icon } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { navigate } from '../../router.js';
import { emptyState } from '../../components/empty-state.js';
import { TOPICS, helpKeys, filterTopics, groupTopics, bodyBlocks } from './help.js';

// What is typed and which topics are open, kept across redraws.
const state = { query: '', onlyNew: false, open: new Set() };

function bodyContent(text) {
  return bodyBlocks(text).map(b => (b.type === 'p' ? h('p', {}, b.text) : h(b.type, {}, b.items.map(item => h('li', {}, item)))));
}

function placeName(topic) {
  if (topic.view === 'settings' && topic.section) return `${t('nav.settings')}, ${t(`settings.section.${topic.section}`)}`;
  return t(`nav.${routeLabel(topic.view)}`);
}

function routeLabel(route) {
  return route.replace(/-([a-z])/g, (m, c) => c.toUpperCase());
}

function openTopic(topic) {
  navigate(topic.view === 'settings' && topic.section ? `settings/${topic.section}` : topic.view);
}

function topicItem(topic) {
  const k = helpKeys(topic.id);
  const bodyId = `help-body-${topic.id}`;
  const isOpen = state.open.has(topic.id);
  const body = h('div', { id: bodyId, class: 'help-body', hidden: !isOpen },
    bodyContent(t(k.body)),
    h('button', { type: 'button', class: 'btn btn-sm help-go', onclick: () => openTopic(topic) }, icon('arrow-right'), t('help.open', { screen: placeName(topic) })));
  const item = h('div', { class: `help-item ${isOpen ? 'is-open' : ''}`.trim(), dataset: { topic: topic.id } });
  const toggle = h('button', {
    type: 'button', class: 'help-row', 'aria-expanded': isOpen ? 'true' : 'false', 'aria-controls': bodyId,
    onclick: () => {
      const open = !state.open.has(topic.id);
      if (open) state.open.add(topic.id); else state.open.delete(topic.id);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      body.hidden = !open;
      item.classList.toggle('is-open', open);
    }
  },
  h('span', { class: 'help-row-icon' }, icon(topic.icon)),
  h('span', { class: 'help-row-text' },
    h('span', { class: 'help-row-title' }, h('span', {}, t(k.title)), topic.isNew ? h('span', { class: 'badge badge-new' }, t('help.badge.new')) : null),
    h('span', { class: 'help-row-short' }, t(k.short))),
  icon('chevron-down', 'help-row-chevron'));
  item.append(toggle, body);
  return item;
}

function renderList(list) {
  while (list.firstChild) list.removeChild(list.firstChild);
  const found = filterTopics(TOPICS, state, t);
  if (state.query.trim() || state.onlyNew) list.append(h('p', { class: 'muted small' }, t('help.found', { n: found.length })));
  if (!found.length) {
    list.append(emptyState({ title: t('help.none'), iconName: 'search' }));
  } else {
    groupTopics(found).forEach(({ group, topics }) => list.append(h('section', { class: 'help-group' },
      h('h2', { class: 'help-group-title' }, t(`help.group.${group}`)),
      h('div', { class: 'help-items' }, topics.map(topicItem)))));
  }
  refreshIcons(list);
}

export function renderHelp(root) {
  const direct = String(window.location.hash || '').replace(/^#\/?/, '').split('/')[1];
  if (direct && TOPICS.some(x => x.id === direct)) state.open.add(direct);
  const list = h('div', { class: 'help-list' });
  const input = h('input', {
    type: 'search', class: 'search-input', value: state.query, placeholder: t('help.searchPlaceholder'), 'aria-label': t('help.searchPlaceholder'),
    autocomplete: 'off', spellcheck: 'false', id: 'help-search'
  });
  let timer = null;
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { state.query = input.value; renderList(list); }, 120); });
  const filterBtn = (onlyNew, label) => h('button', {
    type: 'button', class: 'segment', 'aria-pressed': state.onlyNew === onlyNew ? 'true' : 'false',
    onclick: (e) => { state.onlyNew = onlyNew; e.currentTarget.parentNode.querySelectorAll('.segment').forEach(b => b.setAttribute('aria-pressed', b === e.currentTarget ? 'true' : 'false')); renderList(list); }
  }, label);
  root.append(
    h('header', { class: 'view-header' }, h('h1', {}, t('nav.help'))),
    h('p', { class: 'muted help-intro' }, t('help.intro')),
    h('div', { class: 'help-tools' },
      h('div', { class: 'search-field' }, icon('search'), input),
      h('div', { class: 'segmented', role: 'group', 'aria-label': t('help.filter') }, filterBtn(false, t('help.all')), filterBtn(true, t('help.whatsNew')))),
    list);
  renderList(list);
  refreshIcons(root);
}
