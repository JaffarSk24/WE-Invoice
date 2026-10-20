// The archive of removed attachments on a document (removedAttachments):
// each entry keeps the id, name, type, size, when and why it was removed.
import { describe, it, expect } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { SCHEMAS } from './index.js';

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const NOW = '2026-10-20T09:00:00.000Z';
const doc = (extra) => ({ id: 'd1', createdAt: NOW, updatedAt: NOW, kind: 'INVOICE', status: 'ISSUED', currency: 'EUR', lines: [], ...extra });

describe('removed attachments of a document', () => {
  const valid = ajv.compile(SCHEMAS.Document);

  it('accepts the archive entries', () => {
    const entry = { id: 'a1', name: 'zmluva.pdf', mime: 'application/pdf', size: 1200, removedAt: NOW, reason: 'REMOVED_BY_USER' };
    expect(valid(doc({ attachments: [], removedAttachments: [entry] })), JSON.stringify(valid.errors)).toBe(true);
    expect(valid(doc({})), JSON.stringify(valid.errors)).toBe(true);
  });

  it('needs the id, the name and the time of the removal', () => {
    expect(valid(doc({ removedAttachments: [{ id: 'a1', name: 'x.pdf' }] }))).toBe(false);
    expect(valid(doc({ removedAttachments: [{ name: 'x.pdf', removedAt: NOW }] }))).toBe(false);
    expect(valid(doc({ removedAttachments: [{ id: 'a1', name: 'x.pdf', removedAt: 'yesterday' }] }))).toBe(false);
  });
});
