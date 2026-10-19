// The PDF text layer of the Inbox fixtures read by pdf.js (its Node build)
// through the same item and layout code as the app, then recognised by
// the core: AC § 3.11 asks for at least 90 % of the key fields on
// structured PDFs. The embedded Factur-X XML must be found too.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as lib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { recognizeFound, extractInvoiceFields } from '@we-invoice/core';
import { itemsOf } from './pdf.js';
import { itemsToText } from './text-layout.js';

const dir = new URL('../../../tests/fixtures/inbox/', import.meta.url);
const { company, today, cases } = JSON.parse(readFileSync(new URL('cases.json', dir), 'utf8'));
const expected = (id) => cases.find(c => c.id === id).expected;

async function open(name) {
  const data = new Uint8Array(readFileSync(new URL(`pdf/${name}.pdf`, dir)));
  const task = lib.getDocument({ data, isEvalSupported: false });
  const doc = await task.promise;
  doc.close = () => task.destroy();
  return doc;
}

async function pageText(doc) {
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  return itemsToText(itemsOf(lib, await page.getTextContent(), viewport, 1));
}

describe('PDF fixtures', () => {
  it.each([['sk-invoice-simple', 'sk-invoice-simple'], ['sk-invoice-multirate', 'sk-invoice-multirate']])('%s: fields from the text layer', async (file, id) => {
    const doc = await open(file);
    const result = extractInvoiceFields(await pageText(doc), { company, today });
    const want = expected(id);
    const wrong = Object.entries(want).filter(([k, v]) => result.fields[k] !== v);
    expect(wrong).toEqual([]);
    await doc.close();
  });

  it('finds the embedded Factur-X XML and trusts it', async () => {
    const doc = await open('de-invoice-zugferd');
    const xml = [];
    for (const [id] of await doc.getAttachments()) xml.push(new TextDecoder().decode(await doc.getAttachmentContent(id)));
    const result = recognizeFound({ xml, text: await pageText(doc) }, { company, today });
    expect(result.format).toBe('CII');
    expect(result.needsConfirmation).toBe(false);
    expect(result.fields.total).toBe('428.40');
    await doc.close();
  });
});
