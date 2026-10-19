// @vitest-environment happy-dom
// Components in a DOM: the table draws 10 000 rows within the budget and
// keeps only a window of them in the page; fields, tabs and the
// irreversible confirmation behave for the keyboard.
import { describe, it, expect, beforeEach } from 'vitest';
import { createTable } from './table.js';
import { amountField, textField, numberField, dateField, selectField, textArea } from './fields.js';
import { createTabs } from './tabs.js';
import { statusBadge } from './status-badge.js';
import { emptyState } from './empty-state.js';
import { confirmIrreversible } from './confirm-irreversible.js';
import { autocomplete } from './autocomplete.js';
import { resetPrefsCache } from '../prefs.js';
import { sum } from './decimal.js';

beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); resetPrefsCache(); });

const rows = Array.from({ length: 10000 }, (_, i) => ({ id: `r${i}`, number: `FA${i}`, total: '10.10' }));
const columns = [
  { id: 'number', label: 'Number', always: true, sortValue: r => r.number },
  { id: 'total', label: 'Total', align: 'num', render: r => r.total, total: list => sum(list.map(r => r.total)) }
];

describe('table', () => {
  it('shows 10 000 rows with only a window in the page (timing in components.perf.test.js)', () => {
    const table = createTable({ key: 'test', columns, rows, selectable: true });
    document.body.append(table.el);
    const drawn = table.el.querySelectorAll('tbody tr.row').length;
    expect(drawn).toBeGreaterThan(0);
    expect(drawn).toBeLessThan(100);
    expect(table.el.querySelector('tfoot').textContent).toContain('101000');
  });

  it('selects all rows and shows bulk actions', () => {
    let got = null;
    const table = createTable({ key: 'sel', columns, rows: rows.slice(0, 5), selectable: true, bulkActions: [{ label: 'Export', onClick: (r) => { got = r; } }] });
    document.body.append(table.el);
    table.el.querySelector('thead input[type="checkbox"]').click();
    expect(table.selected()).toHaveLength(5);
    const bar = table.el.querySelector('.bulk-bar');
    expect(bar.hidden).toBe(false);
    bar.querySelector('button').click();
    expect(got).toHaveLength(5);
  });

  it('shows the empty state without rows', () => {
    const table = createTable({ key: 'empty', columns, rows: [], empty: emptyState({ title: 'Nothing', actionLabel: 'Add', onAction: () => {} }) });
    expect(table.el.querySelector('.table-empty').hidden).toBe(false);
    expect(table.el.querySelector('.empty-state button')).toBeTruthy();
  });
});

describe('fields', () => {
  it('reads amounts typed with a comma or a dot', () => {
    const f = amountField({ label: 'Amount' });
    f.input.value = '1 200,5';
    expect(f.value()).toBe('1200.5');
    f.input.value = '7.25';
    expect(f.value()).toBe('7.25');
  });
  it('wires the error line with aria', () => {
    const f = textField({ label: 'Name', required: true });
    f.setError('Missing');
    expect(f.input.getAttribute('aria-invalid')).toBe('true');
    expect(f.input.getAttribute('aria-describedby')).toContain(f.el.querySelector('.field-error').id);
    expect(f.input.getAttribute('aria-required')).toBe('true');
  });
});

describe('tabs', () => {
  it('moves with arrows and draws a panel once', () => {
    let drawn = 0;
    const tabs = createTabs({ tabs: [{ id: 'a', label: 'A', render: () => drawn++ }, { id: 'b', label: 'B', render: () => drawn++ }] });
    document.body.append(tabs.el);
    tabs.el.querySelector('[role="tablist"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(tabs.current()).toBe('b');
    tabs.select('a');
    expect(drawn).toBe(2);
    expect(tabs.el.querySelector('[aria-selected="true"]').textContent).toBe('A');
  });
});

describe('status badge and autocomplete', () => {
  it('has colour, icon and text', () => {
    const b = statusBadge('OVERDUE');
    expect(b.className).toContain('status-overdue');
    expect(b.querySelector('[data-lucide]')).toBeTruthy();
    expect(b.textContent.length).toBeGreaterThan(0);
  });
  it('suggests and picks with the keyboard', async () => {
    let picked = null;
    const ac = autocomplete({ label: 'Contact', search: (q) => [{ id: 1, label: `${q} one` }, { id: 2, label: `${q} two` }], onPick: (i) => { picked = i; } });
    document.body.append(ac.el);
    ac.input.value = 'al';
    ac.input.dispatchEvent(new Event('input'));
    await Promise.resolve();
    expect(ac.el.querySelectorAll('[role="option"]').length).toBe(2);
    ac.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    ac.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(picked.id).toBe(1);
  });
});

describe('irreversible confirmation', () => {
  it('keeps the danger button disabled until acknowledged', async () => {
    const answer = confirmIrreversible({ title: 'Send', message: 'Sure?' });
    const danger = document.querySelector('.modal-actions .btn-danger');
    expect(danger.disabled).toBe(true);
    const check = document.getElementById('irreversible-ack');
    check.checked = true;
    check.dispatchEvent(new Event('change'));
    expect(danger.disabled).toBe(false);
    danger.click();
    expect(await answer).toBe(true);
  });
});

describe('field ids', () => {
  it('keeps an id given by the caller and points the label to it', () => {
    const fields = [
      textField({ label: 'Name', attrs: { id: 'own-name' } }),
      numberField({ label: 'Qty', attrs: { id: 'own-qty' } }),
      dateField({ label: 'Date', attrs: { id: 'own-date' } }),
      selectField({ label: 'Kind', options: [{ value: 'a', label: 'A' }], attrs: { id: 'own-kind' } }),
      textArea({ label: 'Note', attrs: { id: 'own-note' } })
    ];
    for (const f of fields) {
      expect(f.el.querySelector('label').getAttribute('for')).toBe(f.input.id);
      expect(f.input.getAttribute('aria-describedby')).toContain(`${f.input.id}-error`);
    }
    expect(fields.map(f => f.input.id)).toEqual(['own-name', 'own-qty', 'own-date', 'own-kind', 'own-note']);
  });
});
