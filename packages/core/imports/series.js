// Numbering continues after an import (03-features.md § 3.13): for every
// series, the imported numbers that fit its mask move its counter past
// the highest one, in the counter period (year, month) of the number.
import { counterKey } from '../numbering/index.js';

function maskPattern(mask) {
  const parts = [];
  const re = /\{(YYYY|YY|MM|N)(?::\d{1,2})?\}/g;
  let last = 0;
  let m;
  while ((m = re.exec(mask))) {
    parts.push(mask.slice(last, m.index).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    parts.push({ YYYY: '(?<y>\\d{4})', YY: '(?<yy>\\d{2})', MM: '(?<m>\\d{2})', N: '(?<n>\\d+)' }[m[1]]);
    last = m.index + m[0].length;
  }
  parts.push(mask.slice(last).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${parts.join('')}$`);
}

/**
 * @param {Array<object>} seriesList  company.series
 * @param {Array<object>} documents  the documents that came in
 * @returns {{series: Array<object>, changed: boolean}}
 */
export function continueSeries(seriesList, documents) {
  let changed = false;
  const series = (seriesList || []).map(s => {
    if (!s || !s.mask || !s.mask.includes('{N')) return s;
    const pattern = maskPattern(s.mask);
    const counters = { ...(s.counters || {}) };
    (documents || []).forEach(d => {
      if (!d.number || (s.kind && s.kind !== d.kind)) return;
      const m = pattern.exec(d.number);
      if (!m) return;
      const g = m.groups;
      const year = g.y || (g.yy ? `20${g.yy}` : (d.issueDate || '').slice(0, 4));
      const month = g.m || (d.issueDate || '').slice(5, 7) || '01';
      const date = `${year}-${month}-01`;
      let key;
      try {
        key = counterKey(s, date);
      } catch {
        return;
      }
      const next = Number(g.n) + 1;
      if (!counters[key] || counters[key] < next) {
        counters[key] = next;
        changed = true;
      }
    });
    return { ...s, counters };
  });
  return { series, changed };
}
