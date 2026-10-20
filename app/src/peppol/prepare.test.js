// The user's attachments on their way into the e-invoice: which files are
// read from the device, which are left out, and the provider's limit.
import { describe, it, expect } from 'vitest';
import { attachmentFiles, prepareUbl } from './prepare.js';

const bytes = (text) => new TextEncoder().encode(text);
const company = {
  name: 'Alfa s.r.o.', ico: '35000007', dic: '2020000004', icDph: 'SK2020000004', vatMode: 'PAYER', registerEntry: 'OR MS Bratislava III, Sro 1/B',
  address: { country: 'SK' }, bankAccounts: [{ id: 'a', iban: 'SK3112000000198742637541', currency: 'EUR', isDefault: true }]
};
const document = {
  id: 'd1', kind: 'INVOICE', status: 'ISSUED', number: 'FA1', issueDate: '2027-01-15', taxDate: '2027-01-15', dueDate: '2027-01-29', currency: 'EUR',
  buyer: { name: 'Beta a.s.', dic: '2020000026', icDph: 'SK2020000026', address: { country: 'SK' } },
  lines: [{ id: 'l', name: 'a', qty: '1', unitPrice: '100', vatCategory: 'S', vatRate: '23' }],
  attachments: [
    { id: 'x1', name: 'rozpis.csv', mime: 'text/csv', size: 4 },
    { id: 'x2', name: 'vykaz.ods', mime: '', size: 3 },
    { id: 'x3', name: 'archiv.zip', mime: 'application/zip', size: 3 }
  ]
};
const store = { get: () => null };

describe('attachments of an e-invoice', () => {
  it('reads the accepted files from the device and lists the others as left out', async () => {
    const asked = [];
    const load = async (id) => { asked.push(id); return { bytes: bytes(id === 'x1' ? 'a;b\n' : 'ODS') }; };
    const { files, skipped } = await attachmentFiles(document, load);
    expect(asked).toEqual(['x1', 'x2']);
    expect(files).toEqual([
      { name: 'rozpis.csv', mime: 'text/csv', base64: 'YTtiCg==' },
      { name: 'vykaz.ods', mime: 'application/vnd.oasis.opendocument.spreadsheet', base64: 'T0RT' }
    ]);
    expect(skipped).toEqual(['archiv.zip']);
  });

  it('names every file that is not on this device', async () => {
    await expect(attachmentFiles(document, async () => null)).rejects.toMatchObject({ code: 'PEPPOL_ATTACHMENT_MISSING', detail: 'rozpis.csv, vykaz.ods' });
    await expect(attachmentFiles(document, null)).rejects.toMatchObject({ code: 'PEPPOL_ATTACHMENT_MISSING' });
    const broken = async () => { throw new Error('IndexedDB closed'); };
    await expect(attachmentFiles(document, broken)).rejects.toMatchObject({ code: 'PEPPOL_ATTACHMENT_MISSING' });
  });

  it('a document without attachments needs no file store', async () => {
    expect(await attachmentFiles({ ...document, attachments: [] }, null)).toEqual({ files: [], skipped: [] });
  });

  it('builds the XML with the files and stops at the provider limit', async () => {
    const load = async () => ({ bytes: bytes('x'.repeat(3000)) });
    const ok = await prepareUbl({ store, document, company, loadAttachment: load });
    expect(ok.xml).toContain('filename="vykaz.ods"');
    expect(ok.skippedAttachments).toEqual(['archiv.zip']);
    const tooLarge = await prepareUbl({ store, document, company, loadAttachment: load, maxMessageBytes: 5000 });
    expect(tooLarge.xml).toBeNull();
    expect(tooLarge.issues.find(i => i.code === 'MESSAGE_TOO_LARGE').detail.limit).toBe(5000);
  });
});
