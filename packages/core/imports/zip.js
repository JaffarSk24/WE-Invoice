// Reading a ZIP (XLSX files of other programs, ISDOCX, our own bundles).
// The central directory is the source of truth; stored and deflated
// entries are supported, which is what spreadsheet programs write. A
// damaged archive raises IMPORT_FILE_DAMAGED instead of returning partial
// content.
import { CoreError } from '../errors.js';
import { crc32, inflateRaw } from '../exports/zip.js';

function damaged(message) {
  return new CoreError('IMPORT_FILE_DAMAGED', message);
}

export function isZip(bytes) {
  return bytes && bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/**
 * @param {Uint8Array} bytes
 * @returns {Promise<Map<string, Uint8Array>>} file name -> content
 */
export async function readZip(bytes) {
  if (!(bytes instanceof Uint8Array)) throw damaged('not a byte array');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw damaged('no end of central directory');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files = new Map();
  const decoder = new TextDecoder('utf-8');
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) throw damaged('broken central directory');
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const packedSize = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const localAt = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLen));
    at += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    if (localAt + 30 > bytes.length || view.getUint32(localAt, true) !== 0x04034b50) throw damaged(`broken entry ${name}`);
    const start = localAt + 30 + view.getUint16(localAt + 26, true) + view.getUint16(localAt + 28, true);
    const packed = bytes.subarray(start, start + packedSize);
    let data;
    if (method === 0) data = packed;
    else if (method === 8) {
      try {
        data = await inflateRaw(packed);
      } catch (e) {
        throw damaged(`cannot inflate ${name}: ${e && e.message}`);
      }
    } else throw damaged(`unsupported compression ${method} in ${name}`);
    if (crc32(data) !== crc) throw damaged(`checksum mismatch in ${name}`);
    files.set(name, data);
  }
  return files;
}
