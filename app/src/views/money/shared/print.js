// Printing through the browser's own print window: a new window gets a
// plain document built with textContent (no HTML from data), system colours
// so it prints black on white, and the print dialog. A blocked pop-up is
// reported to the user.
import { t } from '../../../i18n/index.js';
import { showToast } from '../../../ui/toast.js';

const STYLE = [
  'body { font: 12px system-ui, sans-serif; color: CanvasText; background: Canvas; margin: 24px; }',
  'h1 { font-size: 18px; margin: 0 0 4px; } h2 { font-size: 14px; margin: 18px 0 6px; } p { margin: 4px 0; }',
  'table { width: 100%; border-collapse: collapse; margin-top: 8px; }',
  'th, td { border-bottom: 1px solid GrayText; padding: 4px 6px; text-align: left; vertical-align: top; }',
  'td.num, th.num { text-align: right; white-space: nowrap; } tfoot td { font-weight: 600; }',
  '.signatures { margin-top: 64px; display: flex; justify-content: space-between; }'
].join('\n');

/**
 * @param {{title: string, blocks: Array<{heading?: string, text?: string[], table?: {head: string[], rows: string[][], foot?: string[], num?: number[]}}>, signatures?: string}} doc
 */
export function printDocument(doc) {
  const win = window.open('', '_blank');
  if (!win) { showToast(t('cash.printBlocked'), { type: 'error' }); return false; }
  const d = win.document;
  d.title = doc.title;
  const style = d.createElement('style');
  style.textContent = STYLE;
  d.head.append(style);
  const el = (tag, text, cls) => { const e = d.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
  d.body.append(el('h1', doc.title));
  doc.blocks.forEach(block => {
    if (block.heading) d.body.append(el('h2', block.heading));
    (block.text || []).forEach(line => d.body.append(el('p', line)));
    if (block.table) {
      const num = new Set(block.table.num || []);
      const row = (cells, tag) => { const tr = d.createElement('tr'); cells.forEach((c, i) => tr.append(el(tag, c ?? '', num.has(i) ? 'num' : undefined))); return tr; };
      const table = d.createElement('table');
      const thead = d.createElement('thead');
      thead.append(row(block.table.head, 'th'));
      const tbody = d.createElement('tbody');
      block.table.rows.forEach(r => tbody.append(row(r, 'td')));
      table.append(thead, tbody);
      if (block.table.foot) { const tfoot = d.createElement('tfoot'); tfoot.append(row(block.table.foot, 'td')); table.append(tfoot); }
      d.body.append(table);
    }
  });
  if (doc.signatures) d.body.append(el('p', doc.signatures, 'signatures'));
  win.focus();
  win.print();
  return true;
}
