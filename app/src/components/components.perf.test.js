// @vitest-environment happy-dom
// Performance of the document list (01-product.md § 1.5: 10 000 documents,
// list within 200 ms). Runs in its own pass (npm run test:perf) with no other
// test file in parallel. Best of three, after a warm-up.
import { describe, it, expect, beforeEach } from 'vitest';
import { performance } from 'node:perf_hooks';
import { createTable } from './table.js';
import { visibleRange } from './virtual-list.js';
import { sum } from './decimal.js';
import { resetPrefsCache } from '../prefs.js';

beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); resetPrefsCache(); });

const rows = Array.from({ length: 10000 }, (_, i) => ({ id: `r${i}`, number: `FA${i}`, total: '10.10' }));
const columns = [
  { id: 'number', label: 'Number', always: true, sortValue: r => r.number },
  { id: 'total', label: 'Total', align: 'num', render: r => r.total, total: list => sum(list.map(r => r.total)) }
];

const best = (fn, times = 3) => {
  fn();
  let ms = Infinity;
  for (let i = 0; i < times; i++) {
    const t0 = performance.now();
    fn();
    ms = Math.min(ms, performance.now() - t0);
  }
  return ms;
};

describe('document list performance', () => {
  it('draws a table of 10 000 rows in under 200 ms', () => {
    const ms = best(() => {
      document.body.innerHTML = '';
      const table = createTable({ key: 'perf', columns, rows, selectable: true });
      document.body.append(table.el);
    });
    expect(ms).toBeLessThan(200);
  });

  it('computes the visible range for 10 000 scroll positions in under 200 ms', () => {
    const ms = best(() => {
      for (let i = 0; i < 10000; i++) visibleRange({ scrollTop: i * 48, viewportHeight: 800, rowHeight: 48, total: 10000 });
    });
    expect(ms).toBeLessThan(200);
  });
});
