// Low-level search in the text of an invoice: a folded copy (lower case,
// no diacritics, same length) for matching labels in Slovak, Czech,
// English and German, values cut from the original text at the same
// place, and readers of dates and amounts as printed on documents.
import { parseAmount, round } from '../../money/index.js';

/** The text with unusual spaces made plain and Windows line ends removed. */
export function cleanText(text) {
  return String(text || '').replace(/\r\n?/g, '\n').replace(/[\u00a0\u2007\u202f\t]/g, ' ');
}

// One character per character, so positions in the folded text are
// positions in the original.
export function fold(text) {
  let out = '';
  for (const ch of text) {
    const base = ch.normalize('NFD')[0].toLowerCase();
    out += base.length === ch.length ? base : ch;
  }
  return out;
}

// Between a label and its value: a colon, a "č." or "No.", spaces and at
// most one line break (a value printed under its label).
export const GAP = '[ \\t]*(?:[:#][ \\t]*)?(?:\\n[ \\t]*)?';

// A printed amount: "1 234,50", "1.234,50", "1,234.50", "-12,00", "99.90".
export const AMOUNT = "-?(?:\\d{1,3}(?:[ .,']\\d{3})+|\\d+)(?:[.,]\\d{1,2})";
const CURRENCY_TOKEN = '(?:eur|€|czk|kc|usd|\\$|gbp|£|chf|pln|huf)?';

export function toAmount(raw) {
  const value = raw ? parseAmount(raw.replace(/ /g, '')) : null;
  return value === null ? null : round(value, 2);
}

/** All matches of a pattern in the folded text, as { index, groups, text }. */
export function findAll(folded, pattern) {
  const re = new RegExp(pattern, 'gm');
  const hits = [];
  let m;
  while ((m = re.exec(folded))) {
    hits.push({ index: m.index, end: m.index + m[0].length, groups: m.slice(1), match: m[0] });
    if (m[0].length === 0) re.lastIndex++;
  }
  return hits;
}

/**
 * The value after the first label of a list that has one, by priority:
 * labels earlier in the list win. value is a regex source with one group.
 * @returns {{raw: string, index: number, label: number}|null}
 */
export function labeled(scan, labels, value) {
  for (let i = 0; i < labels.length; i++) {
    const hits = findAll(scan.folded, `(?:^|[^a-z])(?:${labels[i]})${GAP}${value}`);
    if (hits.length) {
      const hit = hits[0];
      const start = hit.end - hit.groups[0].length;
      const below = scan.folded.slice(hit.index, start).includes('\n') ? columnBelow(scan, labels[i], hit.index, value) : null;
      return below ? { ...below, label: i } : { raw: scan.text.slice(start, hit.end), index: hit.index, label: i };
    }
    // A label that is a whole column, its neighbour's label next to it.
    for (const only of findAll(scan.folded, `(?:^|  )(?:${labels[i]})[ \\t]*:?(?=  |$)`)) {
      const below = columnBelow(scan, labels[i], only.index, value);
      if (below) return { ...below, label: i };
    }
  }
  return null;
}

// Runs of text on a line, split at column breaks (two spaces or more).
function columns(line, offset) {
  return findAll(line, '\\S+(?: \\S+)*').map(h => ({ start: offset + h.index, end: offset + h.end }));
}

// Labels side by side with their values on the next line
// ("Datum vystavenia  Datum splatnosti" over "28.02.2026  15.03.2026"):
// the value is the one in the label's column, not the first of the line.
function columnBelow(scan, label, from, value) {
  const at = findAll(scan.folded.slice(from), `(?:${label})`)[0];
  if (!at) return null;
  const labelStart = from + at.index;
  const line = lineAt(scan.folded, labelStart);
  const above = columns(scan.folded.slice(line.start, line.end), line.start);
  if (above.length < 2 || line.end >= scan.folded.length) return null;
  const next = lineAt(scan.folded, line.end + 1);
  const below = columns(scan.folded.slice(next.start, next.end), next.start);
  const k = above.findIndex(c => labelStart >= c.start && labelStart < c.end);
  if (k < 0 || below.length < 2) return null;
  // The same column by its number, else the one starting nearest.
  const column = below.length === above.length ? below[k]
    : below.reduce((a, b) => (Math.abs(b.start - next.start - (above[k].start - line.start)) < Math.abs(a.start - next.start - (above[k].start - line.start)) ? b : a));
  const hit = findAll(scan.folded.slice(column.start, column.end), `^${value}`)[0];
  if (!hit) return null;
  const start = column.start + hit.end - hit.groups[0].length;
  return { raw: scan.text.slice(start, column.start + hit.end), index: labelStart };
}

export function scanOf(text) {
  const clean = cleanText(text);
  return { text: clean, folded: fold(clean) };
}

const DATE_RE = '(\\d{1,2}\\s*[./]\\s*\\d{1,2}\\s*[./]\\s*\\d{4}|\\d{4}-\\d{2}-\\d{2})';
export const DATE_VALUE = DATE_RE;

/** "15. 10. 2026", "15.10.2026", "15/10/2026", "2026-10-15" -> "2026-10-15" when the date exists. */
export function toDate(raw) {
  if (!raw) return null;
  let y; let m; let d;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (iso) [, y, m, d] = iso.map(Number);
  else {
    const parts = raw.split(/\s*[./]\s*/).map(Number);
    if (parts.length !== 3) return null;
    [d, m, y] = parts;
  }
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** An amount after a label, with an optional currency before or after it. */
export function amountValue() {
  return `${CURRENCY_TOKEN}[ \\t]*(${AMOUNT})(?![\\d%])`;
}

/** Every amount on one line of the folded text, in order. */
export function amountsIn(line) {
  return findAll(line, `(?:^|[^\\d.,])(${AMOUNT})(?![\\d%]|[.,]\\d)`).map(h => toAmount(h.groups[0])).filter(v => v !== null);
}

/** Line of a position: its start and end in the text. */
export function lineAt(text, index) {
  const start = text.lastIndexOf('\n', index - 1) + 1;
  const end = text.indexOf('\n', index);
  return { start, end: end < 0 ? text.length : end };
}
