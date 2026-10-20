// Reading the old Excel 97-2003 format (.xls, BIFF8) for the migration:
// KROS and older iDoklad exports still come this way. The workbook stream
// of the compound file is a list of records; the shared string table, the
// number formats (to tell dates) and the cells of one sheet are read, the
// rest is skipped. Numbers are stored as binary doubles in the file; they
// are written out with at most 15 significant digits, the precision Excel
// itself shows, so 0.1 stays "0.1". Excel 95 (BIFF5) and encrypted files
// are refused with their own error codes.
import { CoreError } from '../errors.js';
import { readCfb, isCfb } from './cfb.js';
import { serialToDate } from './xlsx.js';

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

export { isCfb as isXls };

function damaged(message) {
  return new CoreError('IMPORT_FILE_DAMAGED', message);
}

// Reads across the record payloads of SST and its CONTINUE records. A
// string's characters may break at a record boundary; the next record then
// starts with a byte saying whether the characters go on in one or two
// bytes each.
class Segments {
  constructor(parts) {
    this.parts = parts;
    this.i = 0;
    this.at = 0;
  }

  ensure() {
    while (this.i < this.parts.length && this.at >= this.parts[this.i].length) {
      this.i++;
      this.at = 0;
    }
    if (this.i >= this.parts.length) throw damaged('shared strings end too early');
  }

  u8() {
    this.ensure();
    return this.parts[this.i][this.at++];
  }

  u16() { return this.u8() | (this.u8() << 8); }
  u32() { return (this.u16() | (this.u16() << 16)) >>> 0; }

  skip(n) {
    for (let k = 0; k < n; k++) this.u8();
  }

  chars(count, high) {
    let out = '';
    let wide = high;
    for (let k = 0; k < count; k++) {
      if (this.at >= this.parts[this.i].length) {
        this.ensure();
        wide = (this.parts[this.i][this.at++] & 1) === 1;
      }
      out += String.fromCharCode(wide ? this.u16() : this.u8());
    }
    return out;
  }
}

// XLUnicodeRichExtendedString (SST entries).
function richString(seg) {
  const count = seg.u16();
  const flags = seg.u8();
  const runs = flags & 0x08 ? seg.u16() : 0;
  const ext = flags & 0x04 ? seg.u32() : 0;
  const text = seg.chars(count, (flags & 1) === 1);
  seg.skip(runs * 4 + ext);
  return text;
}

// XLUnicodeString inside one record: count (2 bytes or 1), flags, characters.
function plainString(data, at, countBytes = 2) {
  const count = countBytes === 2 ? data[at] | (data[at + 1] << 8) : data[at];
  const flags = data[at + countBytes];
  const start = at + countBytes + 1;
  let out = '';
  if (flags & 1) for (let k = 0; k < count; k++) out += String.fromCharCode(data[start + k * 2] | (data[start + k * 2 + 1] << 8));
  else for (let k = 0; k < count; k++) out += String.fromCharCode(data[start + k]);
  return out;
}

/** A double as Excel shows it: up to 15 significant digits, no exponent for normal amounts. */
export function numberText(value) {
  if (!Number.isFinite(value)) return '';
  if (Number.isInteger(value) && Math.abs(value) < 1e15) return String(value);
  const text = String(Number(value.toPrecision(15)));
  if (!/e/i.test(text)) return text;
  const fixed = Number(value.toPrecision(15)).toFixed(Math.min(20, Math.max(0, 15 - Math.floor(Math.log10(Math.abs(value))))));
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
}

function rkValue(rk) {
  const hundred = rk & 1;
  let value;
  if (rk & 2) {
    const int = rk >> 2;
    if (!hundred) return String(int);
    const sign = int < 0 ? '-' : '';
    const digits = String(Math.abs(int)).padStart(3, '0');
    return `${sign}${digits.slice(0, -2)}.${digits.slice(-2)}`.replace(/\.?0+$/, '');
  }
  const buffer = new DataView(new ArrayBuffer(8));
  buffer.setUint32(4, rk & 0xfffffffc, true);
  value = buffer.getFloat64(0, true);
  return numberText(hundred ? value / 100 : value);
}

function records(stream, from = 0) {
  const out = [];
  const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
  for (let at = from; at + 4 <= stream.length;) {
    const type = view.getUint16(at, true);
    const length = view.getUint16(at + 2, true);
    if (at + 4 + length > stream.length) throw damaged('a record runs past the end of the workbook');
    out.push({ type, at, data: stream.subarray(at + 4, at + 4 + length) });
    at += 4 + length;
    if (type === 0x000a && from) break;
  }
  return out;
}

const u16 = (d, at) => d[at] | (d[at + 1] << 8);
const u32 = (d, at) => (d[at] | (d[at + 1] << 8) | (d[at + 2] << 16) | (d[at + 3] << 24)) >>> 0;
const f64 = (d, at) => new DataView(d.buffer, d.byteOffset + at, 8).getFloat64(0, true);

/**
 * @param {Uint8Array} bytes  the .xls file
 * @param {{sheet?: string}} [options]
 * @returns {{sheets: string[], rows: string[][]}}
 */
export function readXls(bytes, options = {}) {
  const streams = readCfb(bytes);
  if (!streams.has('Workbook')) {
    if (streams.has('Book')) throw new CoreError('IMPORT_XLS_VERSION', 'Excel 95 or older workbook');
    throw damaged('no workbook stream');
  }
  const stream = streams.get('Workbook');
  const globals = [];
  for (const r of records(stream)) {
    globals.push(r);
    if (r.type === 0x000a) break;
  }
  const bof = globals[0];
  if (!bof || bof.type !== 0x0809) throw damaged('the workbook does not start with BOF');
  if (u16(bof.data, 0) !== 0x0600) throw new CoreError('IMPORT_XLS_VERSION', 'not BIFF8');

  const sheets = [];
  const formats = new Map();
  const xfDate = [];
  const sst = [];
  let date1904 = false;
  for (let i = 0; i < globals.length; i++) {
    const { type, data } = globals[i];
    if (type === 0x002f) throw new CoreError('IMPORT_XLS_ENCRYPTED', 'the workbook is protected by a password');
    if (type === 0x0085 && data[5] === 0) sheets.push({ name: plainString(data, 6, 1), at: u32(data, 0) });
    else if (type === 0x0022) date1904 = u16(data, 0) === 1;
    else if (type === 0x041e) formats.set(u16(data, 0), plainString(data, 2));
    else if (type === 0x00e0) xfDate.push(u16(data, 2));
    else if (type === 0x00fc) {
      const parts = [data.subarray(8)];
      for (let j = i + 1; j < globals.length && globals[j].type === 0x003c; j++) parts.push(globals[j].data);
      const seg = new Segments(parts);
      const unique = u32(data, 4);
      for (let k = 0; k < unique; k++) sst.push(richString(seg));
    }
  }
  const isDateXf = xfDate.map(id => {
    if (BUILTIN_DATE_FORMATS.has(id)) return true;
    const code = (formats.get(id) || '').replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
    return /[dy]/i.test(code) && !/^[#0.,\s%]*$/.test(code);
  });
  const chosen = sheets.find(s => s.name === options.sheet) || sheets[0];
  if (!chosen) return { sheets: [], rows: [] };

  const rows = [];
  const put = (row, col, value) => {
    if (!rows[row]) rows[row] = [];
    rows[row][col] = value;
  };
  const numberCell = (xf, text) => (isDateXf[xf] && text !== '' ? serialToDate(Number(text) + (date1904 ? 1462 : 0)) || text : text);
  let pendingString = null;
  for (const { type, data } of records(stream, chosen.at).slice(1)) {
    const row = u16(data, 0);
    const col = u16(data, 2);
    const xf = u16(data, 4);
    switch (type) {
      case 0x00fd: put(row, col, sst[u32(data, 6)] ?? ''); break;
      case 0x0204: put(row, col, plainString(data, 6)); break;
      case 0x0203: put(row, col, numberCell(xf, numberText(f64(data, 6)))); break;
      case 0x027e: put(row, col, numberCell(xf, rkValue(u32(data, 6)))); break;
      case 0x00bd: {
        const last = u16(data, data.length - 2);
        for (let c = col, at = 4; c <= last; c++, at += 6) put(row, c, numberCell(u16(data, at), rkValue(u32(data, at + 2))));
        break;
      }
      case 0x0205: put(row, col, data[7] ? '' : data[6] ? 'TRUE' : 'FALSE'); break;
      case 0x0006:
        if (data[12] === 0xff && data[13] === 0xff) {
          if (data[6] === 0) pendingString = { row, col };
          else if (data[6] === 1) put(row, col, data[8] ? 'TRUE' : 'FALSE');
          else put(row, col, '');
        } else {
          put(row, col, numberCell(xf, numberText(f64(data, 6))));
        }
        break;
      case 0x0207:
        if (pendingString) put(pendingString.row, pendingString.col, plainString(data, 0));
        pendingString = null;
        break;
      default:
    }
  }
  return { sheets: sheets.map(s => s.name), rows: Array.from(rows, r => Array.from(r || [], c => c ?? '')) };
}
