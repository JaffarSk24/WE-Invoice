// The text of a downloaded PDF, page by page, read with pdf.js in the test
// process, so a test can compare the printed totals with the screen.
import { readFileSync } from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

export async function pdfText(path) {
  const data = new Uint8Array(readFileSync(path));
  const task = pdfjs.getDocument({ data, isEvalSupported: false });
  const doc = await task.promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items.map(item => item.str).join(' '));
  }
  await task.destroy();
  // Thin and non-breaking spaces of the number format read as plain ones;
  // a number split into two text runs ("207 ,00") is joined again.
  return pages.join('\n').replace(/[\u00a0\u202f]/g, ' ').replace(/(\d) ,(\d)/g, '$1,$2');
}
