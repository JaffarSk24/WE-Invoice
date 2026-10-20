import { describe, it, expect } from 'vitest';
import {
  attachmentFileName, parseAttachmentName, encodePayload, decodePayload, referencedAttachmentIds, attachmentRecordOf, PAYLOAD_MAGIC
} from './codec.js';

const ID = '01928a3c-0000-7000-8000-0000000000aa';

describe('attachment names', () => {
  it('names the file by the attachment id only', () => {
    expect(attachmentFileName(ID)).toBe(`${ID}.enc`);
    expect(() => attachmentFileName('../x')).toThrow(/Not an attachment id/);
    expect(() => attachmentFileName('')).toThrow();
  });

  it('reads the current and the older names', () => {
    expect(parseAttachmentName(`${ID}.enc`)).toEqual({ id: ID, ext: null });
    expect(parseAttachmentName(`${ID}.PDF.enc`)).toEqual({ id: ID, ext: 'pdf' });
    expect(parseAttachmentName('faktura.pdf')).toBeNull();
    expect(parseAttachmentName('README.txt')).toBeNull();
  });
});

describe('attachment content', () => {
  it('round trips the file with its name, type and pages', () => {
    const file = { name: 'Faktúra 7.pdf', type: 'application/pdf', bytes: new Uint8Array([1, 2, 3, 250]), pages: [[{ str: 'Spolu', x: 0.1, y: 0.2, w: 0.1, h: 0.02 }]] };
    const bytes = encodePayload(file);
    expect(Array.from(bytes.subarray(0, 4))).toEqual(Array.from(PAYLOAD_MAGIC));
    expect(decodePayload(bytes)).toEqual(file);
  });

  it('reads an older file without a header from the record', () => {
    const raw = new TextEncoder().encode('%PDF-1.7');
    expect(decodePayload(raw, { name: 'a.pdf', ext: 'pdf' })).toEqual({ name: 'a.pdf', type: 'application/pdf', bytes: raw, pages: [] });
    expect(decodePayload(raw, { name: 'a.bin', type: 'application/x-test' }).type).toBe('application/x-test');
  });

  it('refuses a cut header, a broken header and a newer format', () => {
    const good = encodePayload({ name: 'a', type: 't', bytes: new Uint8Array([1]) });
    expect(() => decodePayload(good.subarray(0, 12))).toThrow(/cut off/);
    const broken = good.slice();
    broken[9] = 0x7b; broken[10] = 0x7b;
    expect(() => decodePayload(broken)).toThrow(/not JSON/);
    const header = new TextEncoder().encode('{"v":9}');
    const len = new Uint8Array(4);
    new DataView(len.buffer).setUint32(0, header.length);
    const newer = new Uint8Array([...PAYLOAD_MAGIC, ...len, ...header]);
    expect(() => decodePayload(newer)).toThrow(/NEWER_FORMAT|format/);
    expect(() => decodePayload('text')).toThrow(/not bytes/);
  });
});

describe('references', () => {
  it('lists the attachments of live documents only', () => {
    const data = {
      documents: [
        { id: 'd1', attachments: [{ id: 'a1', name: 'x.pdf' }, { id: 'a2', name: 'y.png', mime: 'image/png' }] },
        { id: 'd2', deleted: true, attachments: [{ id: 'a3', name: 'z.pdf' }] },
        { id: 'd3' }
      ]
    };
    expect(Array.from(referencedAttachmentIds(data)).sort()).toEqual(['a1', 'a2']);
    expect(attachmentRecordOf(data, 'a2').mime).toBe('image/png');
    expect(attachmentRecordOf(data, 'nope')).toBeNull();
    expect(referencedAttachmentIds(null).size).toBe(0);
  });
});
