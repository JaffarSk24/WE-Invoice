// Tabs (WAI-ARIA tabs pattern): arrows move between tabs, Home and End
// jump, the panel of the chosen tab is shown. tabs: [{ id, label, render }]
// where render(panel) draws the content the first time the tab opens.
import { h } from '../ui/dom.js';

let counter = 0;

export function createTabs({ tabs, active = null, onChange = null, cls = '' }) {
  const id = `tabs-${++counter}`;
  const list = h('div', { role: 'tablist', class: 'tabs' });
  const panels = h('div', { class: 'tab-panels' });
  const drawn = new Set();
  let current = active || (tabs[0] && tabs[0].id);

  const buttons = tabs.map(tab => h('button', {
    type: 'button', role: 'tab', id: `${id}-tab-${tab.id}`, 'aria-controls': `${id}-panel-${tab.id}`,
    class: 'tab', dataset: { tab: tab.id }, onclick: () => select(tab.id)
  }, tab.label));
  const panelEls = tabs.map(tab => h('div', {
    role: 'tabpanel', id: `${id}-panel-${tab.id}`, 'aria-labelledby': `${id}-tab-${tab.id}`, class: 'tab-panel', tabindex: '0', hidden: true
  }));

  function select(tabId, { focus = false } = {}) {
    current = tabId;
    tabs.forEach((tab, i) => {
      const on = tab.id === tabId;
      buttons[i].setAttribute('aria-selected', on ? 'true' : 'false');
      buttons[i].tabIndex = on ? 0 : -1;
      panelEls[i].hidden = !on;
      if (on && !drawn.has(tab.id)) { drawn.add(tab.id); if (tab.render) tab.render(panelEls[i]); }
      if (on && focus) buttons[i].focus();
    });
    if (onChange) onChange(tabId);
  }

  list.addEventListener('keydown', (e) => {
    const i = tabs.findIndex(t => t.id === current);
    const keys = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    select(tabs[(keys[e.key] + tabs.length) % tabs.length].id, { focus: true });
  });

  list.append(...buttons);
  panels.append(...panelEls);
  const el = h('div', { class: `tabs-wrap ${cls}`.trim() }, list, panels);
  select(current);
  return { el, select, current: () => current };
}
