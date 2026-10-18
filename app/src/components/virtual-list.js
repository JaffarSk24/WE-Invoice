// Virtual scrolling: of 10 000 rows only the visible ones (plus a few
// above and below) are in the page, so a list draws in well under 200 ms
// and scrolls without stutter. Rows have one fixed height; the engine
// keeps a spacer before and after the drawn rows so the scrollbar is true.
//
// The engine knows nothing about tables or cards: `mount` gives it the
// scrolling element and the container the rows go into, `renderRow(row,
// index)` draws one, and `spacer(height)` makes the filler elements.

export const DEFAULT_OVERSCAN = 8;

// The rows to draw for a scroll position. Pure, tested on its own.
export function visibleRange({ scrollTop, viewportHeight, rowHeight, total, overscan = DEFAULT_OVERSCAN }) {
  if (total <= 0 || rowHeight <= 0) return { start: 0, end: 0 };
  const first = Math.floor(Math.max(0, scrollTop) / rowHeight);
  const count = Math.ceil(Math.max(0, viewportHeight) / rowHeight) + 1;
  const start = Math.max(0, first - overscan);
  const end = Math.min(total, first + count + overscan);
  return { start, end };
}

export function createVirtualList({ rowHeight, renderRow, spacer, overscan = DEFAULT_OVERSCAN }) {
  let rows = [];
  let scroller = null;
  let container = null;
  let last = { start: -1, end: -1 };
  let frame = null;

  function draw(force = false) {
    if (!scroller || !container) return;
    const range = visibleRange({
      scrollTop: scroller.scrollTop, viewportHeight: scroller.clientHeight || 600, rowHeight, total: rows.length, overscan
    });
    if (!force && range.start === last.start && range.end === last.end) return;
    last = range;
    while (container.firstChild) container.removeChild(container.firstChild);
    const fragment = document.createDocumentFragment();
    const before = range.start * rowHeight;
    const after = (rows.length - range.end) * rowHeight;
    if (before > 0) fragment.appendChild(spacer(before));
    for (let i = range.start; i < range.end; i++) fragment.appendChild(renderRow(rows[i], i));
    if (after > 0) fragment.appendChild(spacer(after));
    container.appendChild(fragment);
  }

  function onScroll() {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = null; draw(); });
  }

  return {
    mount(scrollEl, containerEl) {
      scroller = scrollEl;
      container = containerEl;
      scroller.addEventListener('scroll', onScroll, { passive: true });
      draw(true);
    },
    setRows(next) {
      rows = next || [];
      if (scroller) scroller.scrollTop = 0;
      draw(true);
    },
    refresh() { draw(true); },
    range() { return { ...last }; },
    destroy() {
      if (scroller) scroller.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
      scroller = null;
      container = null;
    }
  };
}
