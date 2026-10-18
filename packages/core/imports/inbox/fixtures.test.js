// Recognition over the Inbox fixtures (tests/fixtures/inbox): XML
// e-invoices, payment and eKasa QR codes and texts of invoices and
// receipts in Slovak, Czech, English and German. Structured inputs must
// come out exactly; texts must reach the AC § 3.11 rate for structured
// PDFs (90 % of the expected fields) and every case needs confirmation.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { recognizeXml, recognizeQr, extractInvoiceFields } from './index.js';

const dir = new URL('../../../../tests/fixtures/inbox/', import.meta.url);
const read = (path) => readFileSync(new URL(path, dir), 'utf8');
const { company, today, cases } = JSON.parse(read('cases.json'));
const payloads = JSON.parse(read('qr/payloads.json'));

function recognize(c) {
  if (c.type === 'xml') return recognizeXml(read(c.file), { company, today });
  if (c.type === 'qr') return recognizeQr(payloads[c.key]);
  return extractInvoiceFields(read(c.file), { company, today });
}

function misses(c, result) {
  return Object.entries(c.expected).filter(([k, v]) => result.fields[k] !== v).map(([k, v]) => `${k}: expected ${v}, got ${result.fields[k]}`);
}

describe('inbox fixtures', () => {
  it('has at least 20 cases', () => {
    expect(cases.length).toBeGreaterThanOrEqual(20);
  });

  it.each(cases.filter(c => c.type !== 'text'))('$id is read exactly', (c) => {
    expect(misses(c, recognize(c))).toEqual([]);
  });

  it.each(cases.filter(c => c.type === 'xml'))('$id needs no confirmation', (c) => {
    expect(recognize(c).needsConfirmation).toBe(false);
  });

  it.each(cases.filter(c => c.type === 'text'))('$id: fields from text', (c) => {
    const result = recognize(c);
    expect(result.needsConfirmation).toBe(true);
    expect(misses(c, result)).toEqual([]);
  });

  it('reaches at least 90 % of the expected text fields overall', () => {
    const text = cases.filter(c => c.type === 'text');
    const total = text.reduce((n, c) => n + Object.keys(c.expected).length, 0);
    const wrong = text.reduce((n, c) => n + misses(c, recognize(c)).length, 0);
    expect((total - wrong) / total).toBeGreaterThanOrEqual(0.9);
  });
});
