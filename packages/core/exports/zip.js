// A small ZIP writer (PKWARE APPNOTE 6.3) with no dependency: the
// accountant package, XLSX files and the backup bundle are ZIPs. Text
// files are deflated through the standard CompressionStream when the
// runtime has it (browsers, Electron, Node 18+); files that are already
// compressed (PDF, images) and runtimes without it use "stored". Names are
// UTF-8 (general purpose flag bit 11), times are the local calendar time
// the caller passes, as ZIP keeps no time zone.
import { encodeUtf8 } from './encoding.js';

let crcTable = null;

function crcTableOnce() {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  return crcTable;
}

export function crc32(bytes) {
  const table = crcTableOnce();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const NO_DEFLATE = /\.(pdf|png|jpe?g|gif|webp|zip|gz|xlsx|docx|enc)$/i;

// Web streams are globals in browsers, Electron and Node 18+.
const { Blob, Response, CompressionStream, DecompressionStream } = globalThis;

async function streamBytes(bytes, stream) {
  const piped = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(piped).arrayBuffer());
}

export async function deflateRaw(bytes) {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    return await streamBytes(bytes, new CompressionStream('deflate-raw'));
  } catch (e) {
    console.warn('deflate-raw is not available, storing uncompressed', e);
    return null;
  }
}

export async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('DecompressionStream is not available');
  return streamBytes(bytes, new DecompressionStream('deflate-raw'));
}

// "2026-10-18T14:05:00" (local wall time) -> DOS date and time.
function dosTime(local) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(local || '') || [];
  const [y, mo, d, h, mi, s] = [m[1] || 1980, m[2] || 1, m[3] || 1, m[4] || 0, m[5] || 0, m[6] || 0].map(Number);
  return { date: ((Math.max(y, 1980) - 1980) << 9) | (mo << 5) | d, time: (h << 11) | (mi << 5) | Math.floor(s / 2) };
}

function header(size) {
  const bytes = new Uint8Array(size);
  return { bytes, view: new DataView(bytes.buffer) };
}

/**
 * @param {Array<{name: string, data: Uint8Array|string}>} entries
 * @param {{time?: string, compress?: boolean}} [options] time: local "YYYY-MM-DDTHH:MM:SS"
 * @returns {Promise<Uint8Array>}
 */
export async function buildZip(entries, options = {}) {
  const { date, time } = dosTime(options.time);
  const parts = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encodeUtf8(entry.name);
    const data = typeof entry.data === 'string' ? encodeUtf8(entry.data) : entry.data;
    const crc = crc32(data);
    let body = data;
    let method = 0;
    if (options.compress !== false && data.length > 64 && !NO_DEFLATE.test(entry.name)) {
      const packed = await deflateRaw(data);
      if (packed && packed.length < data.length) {
        body = packed;
        method = 8;
      }
    }
    const local = header(30);
    local.view.setUint32(0, 0x04034b50, true);
    local.view.setUint16(4, 20, true);
    local.view.setUint16(6, 0x0800, true);
    local.view.setUint16(8, method, true);
    local.view.setUint16(10, time, true);
    local.view.setUint16(12, date, true);
    local.view.setUint32(14, crc, true);
    local.view.setUint32(18, body.length, true);
    local.view.setUint32(22, data.length, true);
    local.view.setUint16(26, name.length, true);
    parts.push(local.bytes, name, body);

    const dir = header(46);
    dir.view.setUint32(0, 0x02014b50, true);
    dir.view.setUint16(4, 20, true);
    dir.view.setUint16(6, 20, true);
    dir.view.setUint16(8, 0x0800, true);
    dir.view.setUint16(10, method, true);
    dir.view.setUint16(12, time, true);
    dir.view.setUint16(14, date, true);
    dir.view.setUint32(16, crc, true);
    dir.view.setUint32(20, body.length, true);
    dir.view.setUint32(24, data.length, true);
    dir.view.setUint16(28, name.length, true);
    dir.view.setUint32(42, offset, true);
    central.push(dir.bytes, name);
    offset += 30 + name.length + body.length;
  }
  const dirSize = central.reduce((n, p) => n + p.length, 0);
  const end = header(22);
  end.view.setUint32(0, 0x06054b50, true);
  end.view.setUint16(8, entries.length, true);
  end.view.setUint16(10, entries.length, true);
  end.view.setUint32(12, dirSize, true);
  end.view.setUint32(16, offset, true);
  const all = [...parts, ...central, end.bytes];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  all.forEach(p => { out.set(p, at); at += p.length; });
  return out;
}
