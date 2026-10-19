// Reading a CSV statement, ported from WE Budget (src/import): decoding
// (UTF-8, else windows-1250 which SK and CZ banks still export), an RFC
// 4180 parser, the delimiter that splits the lines most evenly and the row
// that holds the header when the bank writes a preamble above the table.

/**
 * Text of a statement file. Bytes are read as UTF-8; when that shows
 * replacement characters they are read again as windows-1250.
 * @param {string|ArrayBuffer|Uint8Array} input
 * @returns {{text: string, encoding: string}}
 */
export function decodeStatement(input) {
  if (typeof input === 'string') return { text: stripBom(input), encoding: 'text' };
  const view = input instanceof Uint8Array ? input : new Uint8Array(input);
  let text = new TextDecoder('utf-8').decode(view);
  let encoding = 'utf-8';
  if (text.includes('\ufffd')) {
    try {
      text = new TextDecoder('windows-1250').decode(view);
      encoding = 'windows-1250';
    } catch (e) {
      console.warn('windows-1250 is not available; the statement stays UTF-8', e);
    }
  }
  return { text: stripBom(text), encoding };
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Rows of cells: quoted fields, doubled quotes, line breaks inside quotes, CRLF or LF. */
export function parseCsv(text, delimiter = ',') {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = stripBom(String(text ?? ''));
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else { quoted = false; }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const DELIMITERS = [';', ',', '\t', '|'];

/** The delimiter that splits the first lines into the same number of columns most often. */
export function detectDelimiter(text) {
  const sample = String(text ?? '').split(/\r?\n/).filter(l => l.trim()).slice(0, 30).join('\n');
  let best = ',';
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

const DATE_LIKE = /^\s*(\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}[-./]\s?\d{1,2}[-./]\s?\d{2,4})/;

/**
 * Index of the header row: the first row of at least two text cells (no
 * dates) that is followed by a row with a date in it.
 */
export function detectHeaderRow(rows) {
  const limit = Math.min(rows.length - 1, 40);
  for (let i = 0; i < limit; i++) {
    const cells = rows[i].map(c => String(c).trim()).filter(Boolean);
    if (cells.length < 2) continue;
    if (cells.some(c => DATE_LIKE.test(c) || /^[-+]?\d[\d\s.,]*$/.test(c))) continue;
    const next = rows[i + 1] || [];
    if (next.some(c => DATE_LIKE.test(String(c)))) return i;
  }
  return 0;
}
