// Reading CSV files of other programs: the encoding (UTF-8, or
// windows-1250 that Slovak and Czech programs still write), the delimiter
// and RFC 4180 quoting. Ported from WE Budget (src/import/csv.js and
// bank.js) so both apps read the same files the same way.
import { decodeWindows1250 } from '../exports/encoding.js';

/** Text of a file: UTF-8 when it decodes cleanly, else windows-1250. */
export function decodeText(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let text = new TextDecoder('utf-8').decode(view);
  let encoding = 'utf-8';
  if (text.includes('\ufffd')) {
    text = decodeWindows1250(view);
    encoding = 'windows-1250';
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return { text, encoding };
}

/** Rows of cells. Quoted fields may hold the delimiter, quotes and line breaks. */
export function parseCsv(text, delimiter = ',') {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

const DELIMITERS = [';', ',', '\t', '|'];

/** The delimiter that splits the first lines into the same number of columns most often. */
export function detectDelimiter(text) {
  const sample = String(text || '').split(/\r?\n/).filter(l => l.trim()).slice(0, 20).join('\n');
  let best = ';';
  let bestScore = 0;
  DELIMITERS.forEach(d => {
    const counts = parseCsv(sample, d).map(r => r.length).filter(n => n > 1);
    if (!counts.length) return;
    const freq = new Map();
    counts.forEach(n => freq.set(n, (freq.get(n) || 0) + 1));
    const [cols, times] = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    const score = times * 100 + cols;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  });
  return best;
}

/** Rows of a CSV text with its delimiter detected. */
export function readCsv(text, delimiter = null) {
  return parseCsv(text, delimiter || detectDelimiter(text));
}
