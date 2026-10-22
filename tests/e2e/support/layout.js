// Layout checks that run inside the page: no horizontal scroll, no text
// squeezed into a column so narrow that it breaks letter by letter (or a
// short word split across lines), table headers that cover every column,
// cards of one grid row that start at the same height, and no icon left
// undrawn. Used by layout-guard.spec.js; each check returns a
// list of readable problems, empty when the screen is fine.

/** Runs every check in the page and returns the problems found. */
export async function layoutProblems(page, { narrowPx = 40, rowTolerance = 2 } = {}) {
  return page.evaluate(({ narrowPx, rowTolerance }) => {
    const problems = [];
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const s = getComputedStyle(el);
      return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) !== 0;
    };
    const describe = (el) => {
      const id = el.id ? `#${el.id}` : '';
      const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
      const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      return `${el.tagName.toLowerCase()}${id}${cls} "${text}"`;
    };

    // 1. The page itself never scrolls sideways.
    const doc = document.documentElement;
    if (doc.scrollWidth > doc.clientWidth + 1) problems.push(`page scrolls sideways: ${doc.scrollWidth} > ${doc.clientWidth}`);

    // 2. A visible element whose own text runs over several lines in a box
    //    narrower than narrowPx: the words are being broken apart.
    const main = document.querySelector('#main') || document.body;
    const scope = [main, ...document.querySelectorAll('.modal-content')];
    scope.forEach(root => root.querySelectorAll('*').forEach(el => {
      const own = Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
      if (own.length < 4 || !visible(el)) return;
      const r = el.getBoundingClientRect();
      if (r.width >= narrowPx) return;
      const s = getComputedStyle(el);
      const line = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.3;
      if (r.height > line * 1.8) problems.push(`narrow text ${Math.round(r.width)}px wide: ${describe(el)}`);
    }));

    // 2b. A short ordinary word broken across two lines: the box is too
    //     narrow and overflow-wrap splits the word by letters or syllables.
    //     Long tokens (e-mail addresses, IBANs, links) may break on purpose.
    const breaks = (s) => /anywhere|break-word/.test(s.overflowWrap) || /break-all|break-word/.test(s.wordBreak);
    scope.forEach(root => root.querySelectorAll('*').forEach(el => {
      const texts = Array.from(el.childNodes).filter(n => n.nodeType === 3 && n.textContent.trim());
      if (!texts.length || !visible(el)) return;
      const s = getComputedStyle(el);
      const line = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.3;
      if (!breaks(s) || el.getBoundingClientRect().height < line * 1.8) return;
      const range = document.createRange();
      for (const node of texts) {
        const text = node.textContent;
        for (const m of text.matchAll(/[\p{L}\p{N}]+/gu)) {
          if (m[0].length > 20 || /[@./_]/.test(text.slice(Math.max(0, m.index - 1), m.index + m[0].length + 1))) continue;
          range.setStart(node, m.index);
          range.setEnd(node, m.index + m[0].length);
          const tops = new Set(Array.from(range.getClientRects()).filter(r => r.width > 0).map(r => Math.round(r.top)));
          if (tops.size > 1) { problems.push(`word "${m[0]}" broken across lines: ${describe(el)}`); return; }
        }
      }
    }));

    // 3. Every table header covers every column of the first row.
    const span = (cells) => Array.from(cells).reduce((n, c) => n + (c.colSpan || 1), 0);
    main.querySelectorAll('table').forEach(table => {
      if (!visible(table)) return;
      const headRows = table.tHead ? table.tHead.rows : [];
      const head = headRows.length ? headRows[headRows.length - 1] : null;
      const body = Array.from(table.tBodies).flatMap(b => Array.from(b.rows)).find(r => !r.classList.contains('vspacer') && r.cells.length > 0 && visible(r));
      if (!head || !body) return;
      // Only th cells count: an empty td in the header leaves its column
      // without a header cell, so the header band stops short of it.
      const ths = span(Array.from(head.cells).filter(c => c.tagName === 'TH'));
      const tds = span(body.cells);
      if (ths !== tds) problems.push(`table header has ${ths} th columns, first row ${tds} cells: ${describe(table)}`);
    });

    // 4. Cards side by side in one grid start at the same height.
    main.querySelectorAll('*').forEach(grid => {
      if (getComputedStyle(grid).display !== 'grid' || !visible(grid)) return;
      const cards = Array.from(grid.children).filter(c => c.classList.contains('card') && visible(c)).map(c => ({ el: c, r: c.getBoundingClientRect() }));
      for (let i = 0; i < cards.length; i++) {
        for (let j = i + 1; j < cards.length; j++) {
          const a = cards[i].r;
          const b = cards[j].r;
          const sideBySide = a.right <= b.left + 1 || b.right <= a.left + 1;
          const sameRow = a.top < b.bottom && b.top < a.bottom;
          if (sideBySide && sameRow && Math.abs(a.top - b.top) > rowTolerance) {
            problems.push(`cards of one row start ${Math.round(Math.abs(a.top - b.top))}px apart: ${describe(cards[i].el)} / ${describe(cards[j].el)}`);
          }
        }
      }
    });
    // 5. No icon is left as an empty placeholder: a screen that forgot to
    //    draw its icons shows blank buttons.
    main.querySelectorAll('i[data-lucide]').forEach(i => {
      if (i.parentElement && visible(i.parentElement)) problems.push(`icon "${i.getAttribute('data-lucide')}" not drawn: ${describe(i.parentElement)}`);
    });
    return problems;
  }, { narrowPx, rowTolerance });
}
