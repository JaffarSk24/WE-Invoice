// Builds small .xls files for the reader's edge cases (a cached string
// formula, Excel 95, a password, damage): a compound file with one stream
// and BIFF records written byte by byte. Real files from LibreOffice and
// xlwt are in kros-adresar.xls and kros-faktury.xls.
const END = 0xfffffffe;
const FREE = 0xffffffff;

export function record(type, bytes = []) {
  const data = Uint8Array.from(bytes);
  const out = new Uint8Array(4 + data.length);
  const view = new DataView(out.buffer);
  view.setUint16(0, type, true);
  view.setUint16(2, data.length, true);
  out.set(data, 4);
  return out;
}

export const u16 = (n) => [n & 0xff, (n >> 8) & 0xff];
export const u32 = (n) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
export const latin = (text) => [...text].map(c => c.charCodeAt(0));
export function f64(value) {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value, true);
  return [...new Uint8Array(view.buffer)];
}

export function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  parts.forEach(p => { out.set(p, at); at += p.length; });
  return out;
}

/** A workbook stream: globals with one sheet, then the sheet's cell records. */
export function workbook(cells, { version = 0x0600, extraGlobals = [] } = {}) {
  const bof = (dt) => record(0x0809, [...u16(version), ...u16(dt), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const name = latin('Hárok1'.replace('á', 'a'));
  const sheetHead = (offset) => record(0x0085, [...u32(offset), 0, 0, name.length, 0, ...name]);
  const globalsWithout = [bof(0x0005), ...extraGlobals, sheetHead(0), record(0x000a)];
  const offset = globalsWithout.reduce((n, r) => n + r.length, 0);
  const globals = [bof(0x0005), ...extraGlobals, sheetHead(offset), record(0x000a)];
  return concat([...globals, bof(0x0010), ...cells, record(0x000a)]);
}

/** A version 3 compound file holding the given streams (each padded to 4096 bytes). */
export function compoundFile(streams) {
  const sector = 512;
  const names = Object.keys(streams);
  const datas = names.map(n => {
    const d = streams[n];
    const padded = new Uint8Array(Math.max(4096, Math.ceil(d.length / sector) * sector));
    padded.set(d);
    return { data: padded, size: Math.max(4096, d.length) };
  });
  const fat = new Uint32Array(sector / 4).fill(FREE);
  fat[0] = 0xfffffffd;
  fat[1] = END;
  let next = 2;
  const starts = datas.map(({ data }) => {
    const start = next;
    const count = data.length / sector;
    for (let i = 0; i < count; i++) fat[next + i] = i === count - 1 ? END : next + i + 1;
    next += count;
    return start;
  });
  const header = new Uint8Array(sector);
  const hv = new DataView(header.buffer);
  header.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  hv.setUint16(0x18, 0x3e, true);
  hv.setUint16(0x1a, 3, true);
  hv.setUint16(0x1c, 0xfffe, true);
  hv.setUint16(0x1e, 9, true);
  hv.setUint16(0x20, 6, true);
  hv.setUint32(0x2c, 1, true);
  hv.setUint32(0x30, 1, true);
  hv.setUint32(0x38, 4096, true);
  hv.setUint32(0x3c, END, true);
  hv.setUint32(0x44, END, true);
  for (let i = 0; i < 109; i++) hv.setUint32(0x4c + i * 4, i === 0 ? 0 : FREE, true);
  const dir = new Uint8Array(sector);
  const dv = new DataView(dir.buffer);
  const entry = (i, name, type, start, size) => {
    [...name].forEach((c, k) => dv.setUint16(i * 128 + k * 2, c.charCodeAt(0), true));
    dv.setUint16(i * 128 + 0x40, (name.length + 1) * 2, true);
    dir[i * 128 + 0x42] = type;
    dv.setUint32(i * 128 + 0x44, FREE, true);
    dv.setUint32(i * 128 + 0x48, i < names.length ? i + 1 : FREE, true);
    dv.setUint32(i * 128 + 0x4c, i === 0 && names.length ? 1 : FREE, true);
    dv.setUint32(i * 128 + 0x74, start, true);
    dv.setUint32(i * 128 + 0x78, size, true);
  };
  entry(0, 'Root Entry', 5, END, 0);
  names.forEach((n, i) => entry(i + 1, n, 2, starts[i], datas[i].size));
  const fatBytes = new Uint8Array(fat.buffer);
  return concat([header, fatBytes, dir, ...datas.map(d => d.data)]);
}
