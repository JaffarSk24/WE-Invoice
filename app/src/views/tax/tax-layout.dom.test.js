// @vitest-environment happy-dom
// Layout details of the tax screens: dates, numbers and VAT ids keep to one
// line in the tables, and the header icons (period arrows, the disclaimer)
// are drawn as SVG, not left as empty placeholders.
import { describe, it, expect } from 'vitest';
import { simpleTable, periodBar, disclaimer } from './parts.js';
import { refreshIcons } from '../../ui/icons.js';

describe('tax tables', () => {
  it('marks number and nowrap columns', () => {
    const wrap = simpleTable([
      { label: 'Date', value: r => r.date, nowrap: true },
      { label: 'Name', value: r => r.name },
      { label: 'Amount', value: r => r.amount, num: true }
    ], [{ date: '2. 9. 2026', name: 'Alfa', amount: '10,00 €' }]);
    const cells = wrap.querySelectorAll('tbody td');
    expect(cells[0].className).toBe('nowrap');
    expect(cells[1].className).toBe('');
    expect(cells[2].className).toBe('num');
    expect(wrap.querySelectorAll('thead th')[0].className).toBe('nowrap');
  });
});

describe('tax header', () => {
  it('draws the period arrows and the disclaimer icon once refreshed', () => {
    const root = document.createElement('div');
    root.append(disclaimer(), periodBar('2026-09', () => {}));
    document.body.append(root);
    refreshIcons(root);
    expect(root.querySelectorAll('i[data-lucide]')).toHaveLength(0);
    expect(root.querySelectorAll('.tax-period svg')).toHaveLength(2);
  });
});
