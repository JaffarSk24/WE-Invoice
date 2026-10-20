// The retention rules of attachment files (§ 76 zákona o DPH): what a
// draft, an issued or received document, the recycle bin and a removal for
// good keep, and until when.
import { describe, it, expect } from 'vitest';
import { archivesFiles, keepUntil, keptAttachments, mayRemove, archiveYearsOn, removedAttachmentEntry, KEEP_FOREVER } from './retention.js';

const att = (id) => ({ id, name: `${id}.pdf`, mime: 'application/pdf', size: 3 });
const doc = (fields) => ({ id: 'd', createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-01T08:00:00.000Z', kind: 'INVOICE', currency: 'EUR', lines: [], ...fields });
const ten = () => 10;

describe('which documents archive their files', () => {
  it('drafts and Inbox records do not, issued, received and eFaktury in the Inbox do', () => {
    expect(archivesFiles(doc({ status: 'DRAFT' }))).toBe(false);
    expect(archivesFiles(doc({ status: 'TO_PROCESS', kind: 'RECEIVED_INVOICE' }))).toBe(false);
    expect(archivesFiles(doc({ status: 'TO_PROCESS', kind: 'RECEIVED_INVOICE', peppol: { direction: 'IN' } }))).toBe(true);
    expect(archivesFiles(doc({ status: 'ISSUED' }))).toBe(true);
    expect(archivesFiles(doc({ status: 'PROCESSED', kind: 'RECEIVED_INVOICE' }))).toBe(true);
    expect(archivesFiles(null)).toBe(false);
  });

  it('takes the period from the legislation and keeps for good when it cannot', () => {
    expect(archiveYearsOn('2026-10-01')).toBe(10);
    expect(archiveYearsOn('2026-10-01', () => { throw new Error('none'); })).toBeNull();
    expect(keepUntil(doc({ status: 'ISSUED', issueDate: '2026-10-01' }), ten)).toBe('2036-10-01');
    expect(keepUntil(doc({ status: 'ISSUED', issueDate: '2028-02-29' }), ten)).toBe('2038-03-01');
    expect(keepUntil(doc({ status: 'PROCESSED', receivedDate: '2026-10-19' }), ten)).toBe('2036-10-19');
    expect(keepUntil(doc({ status: 'ISSUED' }), ten)).toBe('2036-10-01');
    expect(keepUntil(doc({ status: 'ISSUED', issueDate: '2026-10-01' }), () => null)).toBe(KEEP_FOREVER);
    expect(keepUntil({ status: 'ISSUED' }, ten)).toBe(KEEP_FOREVER);
  });
});

describe('the files to keep', () => {
  it('rule 1: a draft keeps only what it lists, a deleted Inbox record keeps nothing', () => {
    const kept = keptAttachments({ documents: [
      doc({ id: 'd1', status: 'DRAFT', attachments: [att('a1')] }),
      doc({ id: 'd2', status: 'TO_PROCESS', kind: 'RECEIVED_INVOICE', deleted: true, attachments: [att('a2')] })
    ] }, { yearsOn: ten });
    expect([...kept]).toEqual([['a1', null]]);
  });

  it('rule 2: an issued document keeps its removed attachments with the archive period', () => {
    const kept = keptAttachments({ documents: [
      doc({ id: 'd1', status: 'ISSUED', issueDate: '2026-10-01', attachments: [att('a1')], removedAttachments: [{ ...att('a2'), removedAt: '2026-10-20T10:00:00.000Z' }] })
    ] }, { yearsOn: ten });
    expect([...kept]).toEqual([['a1', '2036-10-01'], ['a2', '2036-10-01']]);
  });

  it('rule 3: the bin keeps everything, a draft removed for good keeps nothing', () => {
    const kept = keptAttachments({ documents: [
      doc({ id: 'd1', status: 'DRAFT', deleted: true, attachments: [att('a1')] }),
      doc({ id: 'd2', status: 'ISSUED', issueDate: '2026-10-01', deleted: true, attachments: [att('a2')] }),
      doc({ id: 'd3', status: 'DRAFT', deleted: true, purgedAt: '2026-10-20T10:00:00.000Z', attachments: [] })
    ] }, { yearsOn: ten });
    expect([...kept]).toEqual([['a1', null], ['a2', '2036-10-01']]);
  });

  it('gives a file listed twice the latest day', () => {
    const kept = keptAttachments({ documents: [
      doc({ id: 'd1', status: 'DRAFT', attachments: [att('a1')] }),
      doc({ id: 'd2', status: 'ISSUED', issueDate: '2027-01-05', attachments: [att('a1')] }),
      doc({ id: 'd3', status: 'ISSUED', issueDate: '2026-01-05', attachments: [att('a1')] })
    ] }, { yearsOn: ten });
    expect(kept.get('a1')).toBe('2037-01-05');
    expect(keptAttachments(null).size).toBe(0);
  });

  it('lets a file go only after its last day', () => {
    expect(mayRemove(null, '2026-10-20')).toBe(true);
    expect(mayRemove('2036-10-01', '2036-10-01')).toBe(false);
    expect(mayRemove('2036-10-01', '2036-10-02')).toBe(true);
    expect(mayRemove(KEEP_FOREVER, '2999-01-01')).toBe(false);
  });

  it('builds the archive entry of a removed attachment', () => {
    expect(removedAttachmentEntry({ id: 'a1', name: 'x.pdf', size: 5 }, '2026-10-20T10:00:00.000Z'))
      .toEqual({ id: 'a1', name: 'x.pdf', mime: 'application/octet-stream', size: 5, removedAt: '2026-10-20T10:00:00.000Z', reason: 'REMOVED_BY_USER' });
  });
});
