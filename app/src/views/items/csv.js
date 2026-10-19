// CSV import of the price list: the text is split into rows (quoted
// fields, the separator ";", "," or a tab found from the header, a BOM
// dropped), the columns are recognised by their names in Slovak, Czech or
// English, and every row becomes an item checked like one typed in by
// hand. Rows with errors are reported by number and never imported half.
import { normalizeItem, UNIT_CODES } from './model.js';

// Splits CSV text into rows of fields (RFC 4180 quoting).
export function parseCsv(input) {
  const textIn = String(input || '').replace(/^\ufeff/, '');
  const firstLine = textIn.split(/\r?\n/, 1)[0] || '';
  const counts = [';', ',', '\t'].map(sep => [sep, firstLine.split(sep).length]);
  const sep = counts.sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < textIn.length; i++) {
    const ch = textIn[i];
    if (quoted) {
      if (ch === '"' && textIn[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === sep) { row.push(field); field = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && textIn[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

const fold = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

// Column names (folded) for each item field.
const COLUMNS = {
  name: ['name', 'nazov', 'nazev', 'polozka', 'item'],
  code: ['code', 'kod', 'sku', 'katalogove cislo'],
  barcode: ['barcode', 'ean', 'ciarovy kod', 'carovy kod'],
  unit: ['unit', 'jednotka', 'mj', 'merna jednotka', 'mer. jednotka'],
  net: ['price', 'cena', 'cena bez dph', 'net price', 'price net', 'jednotkova cena'],
  gross: ['cena s dph', 'gross price', 'price gross', 'price incl. vat'],
  vatRate: ['vat', 'dph', 'sadzba', 'sadzba dph', 'sazba dph', 'vat rate', 'dph %'],
  category: ['category', 'kategoria', 'kategorie'],
  description: ['description', 'popis']
};

// Usual unit abbreviations to UN/ECE codes.
const UNIT_ALIASES = {
  ks: 'C62', kus: 'C62', pcs: 'C62', pc: 'C62', h: 'HUR', hod: 'HUR', hodina: 'HUR', hour: 'HUR', den: 'DAY', day: 'DAY',
  mes: 'MON', mesiac: 'MON', month: 'MON', kg: 'KGM', m: 'MTR', m2: 'MTK', m3: 'MTQ', l: 'LTR', km: 'KMT', t: 'TNE', sada: 'SET', set: 'SET'
};

export function unitFrom(value) {
  const raw = String(value || '').trim();
  const key = fold(raw).replace(/\.$/, '');
  if (UNIT_CODES.includes(raw.toUpperCase())) return { code: raw.toUpperCase(), label: '' };
  if (UNIT_ALIASES[key]) return { code: UNIT_ALIASES[key], label: raw };
  return { code: 'C62', label: raw };
}

export function mapHeader(header) {
  const map = {};
  header.forEach((name, index) => {
    const f = fold(name);
    Object.entries(COLUMNS).forEach(([field, names]) => { if (map[field] === undefined && names.includes(f)) map[field] = index; });
  });
  return map;
}

// Items from CSV text. Returns { items, errors: [{ row, field, code }] };
// row is the line number in the file (the header is row 1).
export function importItems(input, { currency = 'EUR' } = {}) {
  const rows = parseCsv(input);
  if (!rows.length) return { items: [], errors: [{ row: 1, field: 'file', code: 'CSV_EMPTY' }] };
  const map = mapHeader(rows[0]);
  if (map.name === undefined || (map.net === undefined && map.gross === undefined)) {
    return { items: [], errors: [{ row: 1, field: 'header', code: 'CSV_COLUMNS' }] };
  }
  const items = [];
  const errors = [];
  rows.slice(1).forEach((cells, i) => {
    const get = (field) => (map[field] === undefined ? '' : (cells[map[field]] || '').trim());
    const gross = map.gross !== undefined && get('gross') !== '';
    const rate = get('vatRate').replace('%', '').trim();
    const draft = {
      name: get('name'), code: get('code'), barcode: get('barcode'), unit: unitFrom(get('unit') || 'ks'),
      price: gross ? get('gross') : get('net'), priceType: gross ? 'GROSS' : 'NET',
      vatCategory: rate === '0' ? 'E' : 'S', vatRate: rate || '23', accountingCategory: get('category'),
      description: get('description'), currency
    };
    const { item, errors: rowErrors } = normalizeItem(draft);
    const codes = Object.entries(rowErrors);
    if (codes.length) codes.forEach(([field, code]) => errors.push({ row: i + 2, field, code }));
    else items.push(item);
  });
  return { items, errors };
}
