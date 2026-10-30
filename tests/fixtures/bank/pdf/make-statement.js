// Builds the PDF statement fixture from tatra-statement.txt with pdfmake:
// a text layer laid out like a statement of Tatra banka (runs of two or
// more spaces become columns) and, as banks send them, a password.
// Run from the repository root: node tests/fixtures/bank/pdf/make-statement.js
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { FONT_FILES } from '../../../../app/src/pdf/fonts.js';

export const PASSWORD = 'Vypis-2026';

const require = createRequire(import.meta.url);
const pdfmake = require('pdfmake');
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const fontsDir = here('../../../../app/public/fonts/');
pdfmake.setLocalAccessPolicy(path => String(path).startsWith(fontsDir));
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.addFonts({ Inter: Object.fromEntries(Object.entries(FONT_FILES).map(([s, n]) => [s, fontsDir + n])) });

const content = readFileSync(here('tatra-statement.txt'), 'utf8').trimEnd().split('\n').map(line => {
  const cols = line.split(/\s{2,}/);
  if (cols.length === 1) return { text: line || ' ', margin: [0, 1, 0, 1] };
  return { columns: cols.map(c => ({ text: c, width: 'auto' })), columnGap: 24, margin: [0, 1, 0, 1] };
});

const doc = {
  content, defaultStyle: { font: 'Inter', fontSize: 9 }, pageSize: 'A4', pageMargins: [40, 40, 40, 40],
  info: { title: 'Výpis z účtu' }, version: '1.7ext3', userPassword: PASSWORD, ownerPassword: `${PASSWORD}-owner`, permissions: { printing: 'highResolution' }
};
writeFileSync(here('tatra-statement.pdf'), await pdfmake.createPdf(doc).getBuffer());
console.log('PDF statement fixture written');
