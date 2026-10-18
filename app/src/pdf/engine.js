// The PDF engine: pdfmake, loaded on the first PDF as its own chunk so the
// initial bundle stays small, with the Inter files registered in its
// virtual file system. An engine is { render(docDefinition) -> Blob }; the
// tests and the desktop may inject their own with setPdfEngine().
import { CoreError } from '@we-invoice/core';
import { FONT_FILES, loadFontFiles } from './fonts.js';
import { FONT_NAME } from './doc-definition.js';

let engine = null;
let creating = null;

export function setPdfEngine(custom) {
  engine = custom;
  creating = null;
}

async function createBrowserEngine() {
  const [mod, vfs] = await Promise.all([import('pdfmake/build/pdfmake.min.js'), loadFontFiles()]);
  const pdfMake = mod.default || mod;
  pdfMake.addVirtualFileSystem(vfs);
  pdfMake.addFonts({ [FONT_NAME]: { ...FONT_FILES } });
  return {
    async render(docDefinition) {
      return pdfMake.createPdf(docDefinition).getBlob();
    }
  };
}

export function getPdfEngine() {
  if (engine) return Promise.resolve(engine);
  if (!creating) {
    creating = createBrowserEngine()
      .then(created => { engine = created; return created; })
      .catch(e => {
        creating = null;
        if (e instanceof CoreError) throw e;
        throw new CoreError('PDF_ENGINE_LOAD_FAILED', `The PDF engine could not be loaded: ${e.message}`, { cause: e.message });
      });
  }
  return creating;
}
