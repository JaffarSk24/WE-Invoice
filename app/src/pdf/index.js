// PDF of a document (WP-PDF): the public API of app/src/pdf.
//
//   buildPdf(document, company, options)      -> Promise<Blob>
//   buildDocDefinition(document, company, options)  pure, for tests and previews
//   missingRequisites(document, company)      -> string[] (§ 74 ods. 1 zákona o DPH)
//   pdfFileNameFor(document, company, options) -> "Faktura_2026001_Firma_s_r_o.pdf"
//   PDF_TEMPLATES, PRINT_LANGUAGES             the choices for the settings
//
// buildPdf refuses an incomplete tax document with PDF_MISSING_FIELDS
// (details.fields lists what is missing) unless options.allowIncomplete
// is set, as a draft preview is. The engine (pdfmake) loads lazily on the
// first call; options.engine injects another one.
import { CoreError } from '@we-invoice/core';
import { buildDocDefinition, printSettings } from './doc-definition.js';
import { missingRequisites } from './requisites.js';
import { pdfFileName } from './filename.js';
import { getPdfEngine } from './engine.js';
import { TEMPLATE_IDS } from './templates/index.js';
import { PRINT_LANGUAGES } from './labels.js';

export { buildDocDefinition, missingRequisites, TEMPLATE_IDS as PDF_TEMPLATES, PRINT_LANGUAGES };
export { setPdfEngine } from './engine.js';

export function pdfFileNameFor(document, company, options = {}) {
  const { labels } = printSettings(document, company, options);
  const mask = options.fileMask || (company && company.defaults && company.defaults.pdfFileMask) || undefined;
  return pdfFileName(document, labels, mask);
}

export async function buildPdf(document, company, options = {}) {
  if (!document || typeof document !== 'object') throw new CoreError('PDF_NO_DOCUMENT', 'No document to print');
  const missing = missingRequisites(document, company);
  if (missing.length && !options.allowIncomplete) {
    throw new CoreError('PDF_MISSING_FIELDS', `The document is missing: ${missing.join(', ')}`, { fields: missing });
  }
  const definition = buildDocDefinition(document, company, options);
  const engine = options.engine || await getPdfEngine();
  try {
    return await engine.render(definition);
  } catch (e) {
    if (e instanceof CoreError) throw e;
    throw new CoreError('PDF_RENDER_FAILED', `PDF rendering failed: ${e && e.message}`, { cause: e && e.message });
  }
}
