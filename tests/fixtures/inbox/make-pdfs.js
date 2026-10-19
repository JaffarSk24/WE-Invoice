// Builds the PDF fixtures of the Inbox from the text fixtures with
// pdfmake: a text layer (as an accounting program prints it), one PDF with
// a PAY by square QR code and one with an embedded CII XML (ZUGFeRD).
// Run from the repository root: node tests/fixtures/inbox/make-pdfs.js
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { FONT_FILES } from '../../../app/src/pdf/fonts.js';

const require = createRequire(import.meta.url);
const pdfmake = require('pdfmake');
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const fontsDir = here('../../../app/public/fonts/');
pdfmake.setLocalAccessPolicy(path => String(path).startsWith(fontsDir) || String(path).startsWith(here('.')));
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.addFonts({ Inter: Object.fromEntries(Object.entries(FONT_FILES).map(([s, n]) => [s, fontsDir + n])) });

const payloads = JSON.parse(readFileSync(here('qr/payloads.json'), 'utf8'));

// One text line per paragraph; runs of two or more spaces become columns.
function lines(text) {
  return text.trimEnd().split('\n').map(line => {
    const cols = line.split(/\s{2,}/);
    if (cols.length === 1) return { text: line || ' ', margin: [0, 1, 0, 1] };
    return { columns: cols.map(c => ({ text: c, width: '*' })), columnGap: 10, margin: [0, 1, 0, 1] };
  });
}

async function build(name, { text, qr = null, files = null }) {
  const content = [...lines(text)];
  if (qr) content.push({ qr, fit: 130, margin: [0, 12, 0, 0] });
  const doc = { content, defaultStyle: { font: 'Inter', fontSize: 10 }, pageSize: 'A4', pageMargins: [40, 40, 40, 40], info: { title: name } };
  if (files) doc.files = files;
  const buffer = await pdfmake.createPdf(doc).getBuffer();
  writeFileSync(here(`pdf/${name}.pdf`), buffer);
}

await build('sk-invoice-simple', { text: readFileSync(here('text/sk-invoice-simple.txt'), 'utf8'), qr: payloads['pbs-accounting'] });
await build('sk-invoice-multirate', { text: readFileSync(here('text/sk-invoice-multirate.txt'), 'utf8') });
await build('de-invoice-zugferd', {
  text: readFileSync(here('text/de-invoice.txt'), 'utf8'),
  files: { 'factur-x.xml': { src: here('xml/cii-zugferd.xml'), name: 'factur-x.xml', description: 'Factur-X invoice' } }
});
console.log('PDF fixtures written');
