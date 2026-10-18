// The document templates (03-features.md § 3.7): Klasický, Moderný,
// Minimalistický, Kompaktný. A template is data plus a header function;
// the shared blocks read its settings (sizes, which table columns, how the
// table header and the party boxes look). Unknown ids fall back to the
// classic template so an old document still prints.
import { CLASSIC } from './classic.js';
import { MODERN } from './modern.js';
import { MINIMAL } from './minimal.js';
import { COMPACT } from './compact.js';

export const TEMPLATES = Object.freeze({ CLASSIC, MODERN, MINIMAL, COMPACT });
export const TEMPLATE_IDS = Object.freeze(Object.keys(TEMPLATES));

export function templateById(id) {
  return TEMPLATES[id] || CLASSIC;
}

// The line table columns every template may use; a template lists the ones
// it shows, "discount" appears only when a line has a discount.
export const LINE_COLUMNS = Object.freeze({
  n: { label: 'col.n', width: 16, align: 'right' },
  description: { label: 'col.description', width: '*', align: 'left' },
  qty: { label: 'field.qty', width: 40, align: 'right' },
  unit: { label: 'field.unit', width: 22, align: 'left' },
  unitPrice: { label: 'field.unitPrice', width: 56, align: 'right' },
  discount: { label: 'field.discount', width: 32, align: 'right' },
  vatRate: { label: 'field.vatRate', width: 40, align: 'right' },
  net: { label: 'field.lineNet', width: 58, align: 'right' },
  vat: { label: 'field.vat', width: 48, align: 'right' },
  gross: { label: 'field.lineGross', width: 60, align: 'right' }
});
