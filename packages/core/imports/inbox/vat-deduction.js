// Input VAT of received documents (03-features.md § 3.11): the period in
// which the deduction is claimed and the amount, and where the document
// goes in the kontrolný výkaz. The right to deduct arises on the date of
// supply and is exercised once the invoice is in hand (§ 49 and § 51
// zákona o DPH), so the default period is the later of the two.
import { add, round } from '../../money/index.js';
import { expenseCategory } from './categories.js';

/** "2026-10" or "2026-Q4" for a date and the company's VAT period. */
export function periodOf(date, vatPeriod = 'MONTH') {
  if (!date) return null;
  const [y, m] = date.split('-');
  return vatPeriod === 'QUARTER' ? `${y}-Q${Math.ceil(Number(m) / 3)}` : `${y}-${m}`;
}

/**
 * The period of the deduction, or null when the company does not deduct
 * VAT (not a VAT payer) or the document carries no VAT.
 */
export function deductionPeriod(doc, company) {
  if (!company || company.vatMode !== 'PAYER') return null;
  const supplied = doc.taxDate || doc.issueDate;
  const date = [supplied, doc.receivedDate].filter(Boolean).sort().pop();
  return periodOf(date, company.vatPeriod);
}

/**
 * Deductible VAT of a document: the VAT of its standard-rated groups,
 * zero for a category whose VAT may not be deducted. Credit notes return
 * the VAT as printed (negative or positive), the tax package signs it.
 */
export function deductibleVat(doc, category = null) {
  const c = category ? expenseCategory(category) : null;
  if (c && !c.vatDeductible) return '0.00';
  const breakdown = (doc.totals && doc.totals.breakdown) || [];
  if (!breakdown.length) return round((doc.totals && doc.totals.vat) || '0', 2);
  return round(breakdown.filter(b => b.category === 'S' || b.category === 'AE').reduce((acc, b) => add(acc, b.vat || '0'), '0'), 2);
}

/**
 * Sections of the kontrolný výkaz a received document belongs to: B.2
 * for an invoice from a Slovak VAT payer, B.3 for a receipt (simplified
 * invoice), C.2 for a received credit note, A.2 and B.1 for reverse
 * charge. The tax package (WP-TAX) builds the statement itself.
 */
export function kvSections(doc) {
  const reverse = ((doc.totals && doc.totals.breakdown) || []).some(b => b.category === 'AE');
  if (reverse) return ['A2', 'B1'];
  if (doc.kind === 'EXPENSE_RECEIPT') return ['B3'];
  if (doc.kind === 'RECEIVED_CREDIT_NOTE') return ['C2'];
  if (doc.seller && doc.seller.icDph && doc.seller.icDph.startsWith('SK')) return ['B2'];
  return [];
}
