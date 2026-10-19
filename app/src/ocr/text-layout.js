// Positioned text of a page (PDF text items or OCR words) as plain lines,
// and the text inside a region of the page for "Vybrať" and supplier
// templates. Coordinates are page fractions (0..1) from the top left, so
// a region learnt on one document applies to the next one at any scale.
//
//   item = { str, x, y, w, h }   y is the top of the text box

// Items whose vertical centres are closer than this share a line (in
// fractions of the average text height).
const SAME_LINE = 0.5;
// A horizontal gap wider than this (in text heights) is a column break,
// written as two spaces so the extraction rules can tell columns apart.
const COLUMN_GAP = 1.5;

export function itemsToLines(items) {
  const usable = (items || []).filter(i => i && String(i.str || '').trim());
  if (!usable.length) return [];
  const height = usable.reduce((s, i) => s + (i.h || 0), 0) / usable.length || 0.01;
  const sorted = usable.slice().sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2) || a.x - b.x);
  const lines = [];
  for (const item of sorted) {
    const centre = item.y + item.h / 2;
    const line = lines.find(l => Math.abs(l.centre - centre) < height * SAME_LINE);
    if (line) line.items.push(item);
    else lines.push({ centre, items: [item] });
  }
  return lines.sort((a, b) => a.centre - b.centre).map(l => {
    const row = l.items.sort((a, b) => a.x - b.x);
    let text = '';
    let end = null;
    for (const item of row) {
      if (end !== null) text += item.x - end > height * COLUMN_GAP ? '  ' : (item.x - end > height * 0.15 ? ' ' : '');
      text += String(item.str).trim();
      end = item.x + item.w;
    }
    return text;
  });
}

export function itemsToText(items) {
  return itemsToLines(items).join('\n');
}

/** Text of the items whose centre lies inside a region { x, y, w, h }. */
export function textInRegion(items, region) {
  if (!region) return '';
  const inside = (items || []).filter(i => {
    const cx = i.x + i.w / 2;
    const cy = i.y + i.h / 2;
    return cx >= region.x && cx <= region.x + region.w && cy >= region.y && cy <= region.y + region.h;
  });
  return itemsToText(inside);
}

/** The item under a point, or null. */
export function itemAt(items, x, y) {
  return (items || []).find(i => x >= i.x && x <= i.x + i.w && y >= i.y && y <= i.y + i.h) || null;
}

/** A region around an item with a margin, clamped to the page. */
export function regionOf(item, margin = 0.01) {
  const x = Math.max(0, item.x - margin);
  const y = Math.max(0, item.y - margin);
  return { page: item.page || 1, x, y, w: Math.min(1 - x, item.w + 2 * margin), h: Math.min(1 - y, item.h + 2 * margin) };
}

/**
 * The phrase around an item: the neighbours on its line without a column
 * gap between them ("1 234,50" read by OCR as three words), with the
 * region that covers them.
 * @returns {{text: string, region: object}}
 */
export function phraseAt(items, item) {
  const centre = item.y + item.h / 2;
  const row = (items || []).filter(i => i.page === item.page && Math.abs(i.y + i.h / 2 - centre) < item.h / 2).sort((a, b) => a.x - b.x);
  let start = row.indexOf(item);
  let end = start;
  if (start < 0) return { text: String(item.str), region: regionOf(item, 0) };
  const gap = (a, b) => b.x - (a.x + a.w) <= item.h * COLUMN_GAP;
  while (start > 0 && gap(row[start - 1], row[start])) start--;
  while (end < row.length - 1 && gap(row[end], row[end + 1])) end++;
  const phrase = row.slice(start, end + 1);
  const x = Math.min(...phrase.map(i => i.x));
  const y = Math.min(...phrase.map(i => i.y));
  const right = Math.max(...phrase.map(i => i.x + i.w));
  const bottom = Math.max(...phrase.map(i => i.y + i.h));
  return { text: itemsToText(phrase), region: { page: item.page || 1, x, y, w: right - x, h: bottom - y } };
}
