// Reading an OLE2 compound file (MS-CFB), the container of the old Excel
// 97-2003 .xls format: the header, the sector allocation table (with its
// DIFAT extension), the directory and the mini stream for small streams.
// Every chain is walked with a guard, so a damaged or hostile file ends in
// IMPORT_FILE_DAMAGED instead of a loop or a read outside the file.
import { CoreError } from '../errors.js';

const SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const END = 0xfffffffe;
const FREE = 0xffffffff;

function damaged(message) {
  return new CoreError('IMPORT_FILE_DAMAGED', message);
}

export function isCfb(bytes) {
  return Boolean(bytes) && bytes.length >= 512 && SIGNATURE.every((b, i) => bytes[i] === b);
}

/**
 * @param {Uint8Array} bytes
 * @returns {Map<string, Uint8Array>} stream name -> content
 */
export function readCfb(bytes) {
  if (!isCfb(bytes)) throw damaged('not a compound file');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (at) => view.getUint32(at, true);
  const sectorSize = 1 << view.getUint16(0x1e, true);
  const miniSize = 1 << view.getUint16(0x20, true);
  if (sectorSize !== 512 && sectorSize !== 4096) throw damaged(`sector size ${sectorSize}`);
  const sectorCount = Math.floor((bytes.length - sectorSize) / sectorSize);
  const sector = (n) => {
    if (n >= sectorCount + 1) throw damaged(`sector ${n} outside the file`);
    const start = (n + 1) * sectorSize;
    return bytes.subarray(start, Math.min(start + sectorSize, bytes.length));
  };

  // The sectors that hold the allocation table: 109 in the header, the
  // rest in a chain of DIFAT sectors.
  const fatSectors = [];
  for (let i = 0; i < 109; i++) {
    const s = u32(0x4c + i * 4);
    if (s !== FREE && s !== END) fatSectors.push(s);
  }
  let difat = u32(0x44);
  for (let guard = 0; difat !== END && difat !== FREE && guard < sectorCount; guard++) {
    const data = sector(difat);
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const per = sectorSize / 4 - 1;
    for (let i = 0; i < per; i++) {
      const s = dv.getUint32(i * 4, true);
      if (s !== FREE && s !== END) fatSectors.push(s);
    }
    difat = dv.getUint32(per * 4, true);
  }
  const fat = new Uint32Array(fatSectors.length * (sectorSize / 4));
  fatSectors.forEach((s, i) => {
    const data = sector(s);
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    for (let j = 0; j < sectorSize / 4; j++) fat[i * (sectorSize / 4) + j] = dv.getUint32(j * 4, true);
  });

  const chain = (start, table, limit) => {
    const out = [];
    for (let s = start; s !== END && s !== FREE; s = table[s]) {
      if (s >= table.length || out.length > limit) throw damaged('broken sector chain');
      out.push(s);
    }
    return out;
  };
  const readChain = (start) => {
    const parts = chain(start, fat, sectorCount).map(sector);
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    parts.forEach(p => { out.set(p, at); at += p.length; });
    return out;
  };

  const dir = readChain(u32(0x30));
  const entries = [];
  for (let at = 0; at + 128 <= dir.length; at += 128) {
    const dv = new DataView(dir.buffer, dir.byteOffset + at, 128);
    const nameLength = dv.getUint16(0x40, true);
    const type = dir[at + 0x42];
    if (!type || nameLength < 2 || nameLength > 64) continue;
    let name = '';
    for (let i = 0; i < nameLength / 2 - 1; i++) name += String.fromCharCode(dv.getUint16(i * 2, true));
    entries.push({ name, type, start: dv.getUint32(0x74, true), size: dv.getUint32(0x78, true) });
  }
  const root = entries.find(e => e.type === 5);
  if (!root) throw damaged('no root entry');

  const miniStream = root.start === END ? new Uint8Array(0) : readChain(root.start);
  const miniFatStart = u32(0x3c);
  let miniFat = new Uint32Array(0);
  if (miniFatStart !== END && miniFatStart !== FREE) {
    const raw = readChain(miniFatStart);
    miniFat = new Uint32Array(raw.length / 4);
    const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    for (let i = 0; i < miniFat.length; i++) miniFat[i] = dv.getUint32(i * 4, true);
  }
  const cutoff = u32(0x38) || 4096;

  const streams = new Map();
  entries.filter(e => e.type === 2).forEach(e => {
    let data;
    if (e.size < cutoff) {
      const parts = chain(e.start, miniFat, miniStream.length / miniSize).map(s => miniStream.subarray(s * miniSize, (s + 1) * miniSize));
      data = new Uint8Array(parts.length * miniSize);
      parts.forEach((p, i) => data.set(p, i * miniSize));
    } else {
      data = readChain(e.start);
    }
    if (data.length < e.size) throw damaged(`stream ${e.name} is shorter than its size`);
    streams.set(e.name, data.subarray(0, e.size));
  });
  return streams;
}
