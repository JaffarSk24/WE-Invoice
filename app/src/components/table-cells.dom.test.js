// @vitest-environment happy-dom
// Text cells of a list end with an ellipsis and keep the full text as a
// title, so one long name cannot push the other columns out of the table;
// numbers and nodes (badges, links) are left as they are.
import { describe, it, expect, beforeEach } from 'vitest';
import { createTable, textCell } from './table.js';
import { resetPrefsCache } from '../prefs.js';

beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); resetPrefsCache(); });

describe('text cells', () => {
  it('wraps plain text in an ellipsis box with the full text as its title', () => {
    const cell = textCell('Severoslovenská stavebná a obchodná spoločnosť');
    expect(cell.className).toBe('cell-text');
    expect(cell.title).toBe('Severoslovenská stavebná a obchodná spoločnosť');
    expect(cell.textContent).toBe('Severoslovenská stavebná a obchodná spoločnosť');
  });

  it('leaves empty values and nodes alone', () => {
    const badge = document.createElement('span');
    expect(textCell(badge)).toBe(badge);
    expect(textCell('')).toBe('');
    expect(textCell(null)).toBe(null);
  });

  it('is used for the text columns of a table', () => {
    const table = createTable({ key: 'cells', columns: [{ id: 'name', label: 'Name', always: true }], rows: [{ id: 'r1', name: 'Alfa' }] });
    document.body.append(table.el);
    const cell = table.el.querySelector('tbody tr.row td .cell-text');
    expect(cell.textContent).toBe('Alfa');
    expect(cell.title).toBe('Alfa');
  });
});
