import { describe, it, expect } from 'vitest';
import { attachmentMime, splitAttachments, attachmentIds, messageBytes, base64Bytes, EMBEDDABLE_MIME_TYPES, DEFAULT_MAX_MESSAGE_BYTES } from './attachments.js';

describe('e-invoice attachments', () => {
  it('allows exactly the MIME codes of Peppol BIS 3 and 10 MB by default', () => {
    expect([...EMBEDDABLE_MIME_TYPES].sort()).toEqual([
      'application/pdf', 'application/vnd.oasis.opendocument.spreadsheet',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/jpeg', 'image/png', 'text/csv'
    ]);
    expect(DEFAULT_MAX_MESSAGE_BYTES).toBe(10 * 1024 * 1024);
  });

  it.each([
    ['a.pdf', 'application/pdf', 'application/pdf'],
    ['a.JPG', '', 'image/jpeg'],
    ['a.jpg', 'image/jpg', 'image/jpeg'],
    ['a.xlsx', 'application/octet-stream', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['a.ods', null, 'application/vnd.oasis.opendocument.spreadsheet'],
    ['a.csv', 'text/csv; charset=utf-8', 'text/csv'],
    ['a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['a.bin', '', 'application/octet-stream']
  ])('%s declared as %s is %s', (name, mime, expected) => {
    expect(attachmentMime(name, mime)).toBe(expected);
  });

  it('splits the files of a document into embeddable and left out', () => {
    const { embeddable, skipped } = splitAttachments([{ name: 'a.png', mime: '' }, { name: 'b.zip', mime: 'application/zip' }, { name: 'c.pdf', mime: 'application/pdf' }]);
    expect(embeddable.map(a => [a.name, a.mime])).toEqual([['a.png', 'image/png'], ['c.pdf', 'application/pdf']]);
    expect(skipped.map(a => a.name)).toEqual(['b.zip']);
    expect(splitAttachments(null)).toEqual({ embeddable: [], skipped: [] });
  });

  it('gives every reference its own id', () => {
    expect(attachmentIds('FA1', 3, ['FA1'])).toEqual(['FA1-1', 'FA1-2', 'FA1-3']);
    expect(attachmentIds('FA1', 2, ['FA1-1'])).toEqual(['FA1-2', 'FA1-3']);
    expect(attachmentIds(null, 1)).toEqual(['ATT-1']);
  });

  it('counts bytes of the message and of base64 content', () => {
    expect(messageBytes('č')).toBe(2);
    expect(base64Bytes('YSxiCg==')).toBe(4);
    expect(base64Bytes('JVBERi0xLjQK')).toBe(9);
  });
});
