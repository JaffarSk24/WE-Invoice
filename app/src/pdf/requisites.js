// Mandatory particulars before a PDF is saved (§ 74 ods. 1 zákona o DPH and
// § 3a Obchodného zákonníka). The rules themselves live in the core
// (missingParticulars), the same check that guards issuing a document, so
// the PDF and the issue gate cannot disagree. On top of it a printed copy
// needs its number even while the document is a draft, and a tax document
// needs computed totals for the VAT summary. Field paths are reduced to
// one entry per kind ("lines[2].qty" becomes "lines.qty").
import { missingParticulars } from '@we-invoice/core';
import { isTaxDocument } from './legal.js';

const hasText = (value) => value !== null && value !== undefined && String(value).trim() !== '';

/**
 * @returns {string[]} codes such as "seller.name", "number", "lines.qty"; empty when complete
 */
export function missingRequisites(document, company) {
  const missing = [];
  if (!hasText(document.number)) missing.push('number');
  for (const { field } of missingParticulars(document, company)) missing.push(field.replace(/\[\d+\]/g, ''));
  if (isTaxDocument(document.kind) && !document.totals) missing.push('totals');
  return [...new Set(missing)];
}
