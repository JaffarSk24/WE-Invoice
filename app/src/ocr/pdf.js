// PDF reading for the Inbox with pdf.js, loaded on the first PDF so the
// initial bundle stays small: positioned text of every page, files
// embedded in the PDF (ZUGFeRD, ISDOC, UBL attachments) and pages drawn
// on a canvas for the preview, the QR search and OCR. The legacy build
// keeps older Safari on iPhones working; eval is off for the CSP.
import { CoreError } from '@we-invoice/core';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

let loading = null;

function pdfjs() {
  if (!loading) {
    loading = import('pdfjs-dist/legacy/build/pdf.min.mjs').then(mod => {
      mod.GlobalWorkerOptions.workerSrc = workerUrl;
      return mod;
    }).catch(e => {
      loading = null;
      throw new CoreError('PDF_READER_LOAD_FAILED', `pdf.js could not be loaded: ${e.message}`);
    });
  }
  return loading;
}

// Text items of a page as fractions of the page, top left origin.
export function itemsOf(lib, content, viewport, page) {
  return content.items.filter(i => typeof i.str === 'string' && i.str.trim()).map(i => {
    const t = lib.Util.transform(viewport.transform, i.transform);
    const height = Math.hypot(t[2], t[3]) || 1;
    const width = (i.width || 0) * viewport.scale;
    return { str: i.str, page, x: t[4] / viewport.width, y: (t[5] - height) / viewport.height, w: width / viewport.width, h: height / viewport.height };
  });
}

/**
 * Opens a PDF from its bytes.
 * @returns {Promise<{numPages: number, pageItems: (n: number) => Promise<object[]>,
 *   attachments: () => Promise<Array<{name: string, bytes: Uint8Array}>>,
 *   renderPage: (n: number, canvas: HTMLCanvasElement, width: number) => Promise<{width: number, height: number}>,
 *   destroy: () => Promise<void>}>}
 */
export async function openPdf(bytes) {
  const lib = await pdfjs();
  let doc;
  const task = lib.getDocument({ data: bytes.slice(0), isEvalSupported: false, useSystemFonts: false });
  try {
    doc = await task.promise;
  } catch (e) {
    const code = e && e.name === 'PasswordException' ? 'PDF_PASSWORD' : 'PDF_DAMAGED';
    throw new CoreError(code, `The PDF could not be opened: ${e && e.message}`);
  }
  return {
    numPages: doc.numPages,
    async pageItems(n) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      return itemsOf(lib, await page.getTextContent(), viewport, n);
    },
    async attachments() {
      // pdf.js 6 lists attachments in a Map and loads each content on request;
      // older versions return an object with the content inside.
      const found = (await doc.getAttachments()) || {};
      const entries = found instanceof Map ? [...found.entries()] : Object.entries(found);
      const out = [];
      for (const [id, a] of entries) {
        const bytes = a.content || (doc.getAttachmentContent ? await doc.getAttachmentContent(id) : null);
        if (bytes) out.push({ name: a.filename || a.rawFilename || 'attachment', bytes });
      }
      return out;
    },
    async renderPage(n, canvas, width) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / base.width });
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
      return { width: canvas.width, height: canvas.height };
    },
    destroy: () => task.destroy()
  };
}
