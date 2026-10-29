// @vitest-environment happy-dom
// Phones have no sidebar: the company switcher sits in a strip over every
// screen, kept in step with the list; the More screen lists the menu only.
import { describe, it, expect, beforeEach } from 'vitest';
import { renderMore, renderShell } from './shell.js';
import { refreshNav } from './sidebar.js';
import { initCompanyState, resetCompanyState } from './company-state.js';
import { emit, on } from '../../events.js';
import { getPrefs } from '../../prefs.js';

describe('company switcher on a phone', () => {
  beforeEach(() => { resetCompanyState(); initCompanyState(); document.body.replaceChildren(); });

  it('switches the company from the strip over the screen', () => {
    emit('company:switched', { company: { id: 'a', name: 'Alfa' }, companies: [{ id: 'a', name: 'Alfa' }, { id: 'b', name: 'Beta' }] });
    const root = document.createElement('div');
    document.body.append(root);
    const main = renderShell(root, { active: 'more', prefs: getPrefs(), onLanguage: () => {}, onTheme: () => {} });
    renderMore(main);
    expect(main.querySelector('.company-switcher')).toBeNull();
    const select = root.querySelector('.phone-company-bar #phone-company-switcher');
    expect([...select.options].map(o => o.textContent).slice(0, 2)).toEqual(['Alfa', 'Beta']);
    const asked = [];
    const off = on('company:switch', (p) => asked.push(p.id));
    select.value = 'b';
    select.dispatchEvent(new Event('change'));
    off();
    expect(asked).toEqual(['b']);

    emit('company:switched', { company: { id: 'b', name: 'Beta' }, companies: [{ id: 'a', name: 'Alfa' }, { id: 'b', name: 'Beta' }] });
    refreshNav('more');
    expect(document.querySelector('#phone-company-switcher').value).toBe('b');
    expect(document.querySelector('#company-switcher').value).toBe('b');
  });

  it('puts the company switcher at the top of the sidebar, before the menu', () => {
    const root = document.createElement('div');
    document.body.append(root);
    renderShell(root, { active: 'dashboard', prefs: getPrefs(), onLanguage: () => {}, onTheme: () => {} });
    const sidebar = root.querySelector('.sidebar');
    const children = [...sidebar.children];
    const block = sidebar.querySelector('.company-block');
    expect(children.indexOf(block)).toBeLessThan(children.indexOf(sidebar.querySelector('.nav')));
    expect(children.indexOf(block)).toBeLessThan(children.indexOf(sidebar.querySelector('#btn-new-invoice')));
    expect(sidebar.querySelector('.sidebar-footer .company-switcher')).toBeNull();
  });
});
