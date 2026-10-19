// @vitest-environment happy-dom
// The phone's More screen carries a company switch of its own (the menu
// with the other one is hidden on phones), kept in step with the list.
import { describe, it, expect, beforeEach } from 'vitest';
import { renderMore } from './shell.js';
import { refreshNav } from './sidebar.js';
import { initCompanyState, resetCompanyState } from './company-state.js';
import { emit, on } from '../../events.js';

describe('More screen', () => {
  beforeEach(() => { resetCompanyState(); initCompanyState(); document.body.replaceChildren(); });

  it('switches the company from the phone', () => {
    emit('company:switched', { company: { id: 'a', name: 'Alfa' }, companies: [{ id: 'a', name: 'Alfa' }, { id: 'b', name: 'Beta' }] });
    const root = document.createElement('main');
    document.body.append(root);
    renderMore(root);
    const select = root.querySelector('#more-company-switcher');
    expect([...select.options].map(o => o.textContent).slice(0, 2)).toEqual(['Alfa', 'Beta']);
    const asked = [];
    const off = on('company:switch', (p) => asked.push(p.id));
    select.value = 'b';
    select.dispatchEvent(new Event('change'));
    off();
    expect(asked).toEqual(['b']);

    emit('company:switched', { company: { id: 'b', name: 'Beta' }, companies: [{ id: 'a', name: 'Alfa' }, { id: 'b', name: 'Beta' }] });
    refreshNav('more');
    expect(document.querySelector('#more-company-switcher').value).toBe('b');
  });
});
