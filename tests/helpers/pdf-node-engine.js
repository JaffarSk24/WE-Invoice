// A PDF engine for the tests: pdfmake's Node entry with the Inter files
// from app/public/fonts, rendering a docDefinition to bytes. Same shape
// as the browser engine ({ render(docDefinition) }), so buildPdf is
// exercised end to end without a browser.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { FONT_FILES } from '../../app/src/pdf/fonts.js';

const require = createRequire(import.meta.url);
const fontsDir = fileURLToPath(new URL('../../app/public/fonts/', import.meta.url));

let pdfmake = null;

function engine() {
  if (!pdfmake) {
    pdfmake = require('pdfmake');
    pdfmake.setLocalAccessPolicy(path => String(path).startsWith(fontsDir));
    pdfmake.setUrlAccessPolicy(() => false);
    const files = Object.fromEntries(Object.entries(FONT_FILES).map(([style, name]) => [style, fontsDir + name]));
    pdfmake.addFonts({ Inter: files });
  }
  return pdfmake;
}

export const nodePdfEngine = {
  async render(docDefinition) {
    const buffer = await engine().createPdf(docDefinition).getBuffer();
    return new Blob([buffer], { type: 'application/pdf' });
  }
};

export async function pdfBytes(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

export function pageCount(bytes) {
  const text = Buffer.from(bytes).toString('latin1');
  return (text.match(/\/Type \/Page(?![s])/g) || []).length;
}
