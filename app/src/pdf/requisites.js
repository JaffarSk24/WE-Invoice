// Mandatory particulars of an invoice (§ 74 ods. 1 zákona o DPH and § 3a
// Obchodného zákonníka): the PDF is refused while one is missing, with
// the list of what is missing so the editor can point at the fields. Tax
// documents (invoice, credit and debit note, advance tax document,
// self-billing) need the full set; other printed documents only the
// basics. Pure function; the core's missingParticulars() is still a stub
// and should take this over.
import { isTaxDocument, isVatPayer } from './legal.js';

const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
const hasAddress = (party) => Boolean(party && party.address && hasText(party.address.city));

/**
 * @returns {string[]} codes such as "seller.name", "number", "lines.qty"; empty when complete
 */
export function missingRequisites(document, company) {
  const missing = [];
  const seller = document.seller || {};
  const buyer = document.buyer || {};
  if (!hasText(seller.name)) missing.push('seller.name');
  if (!hasText(document.number)) missing.push('number');
  if (!document.issueDate) missing.push('issueDate');
  const items = (document.lines || []).filter(l => l.kind !== 'TEXT' && l.kind !== 'SUBTOTAL');
  if (!items.length && document.kind !== 'REMINDER') missing.push('lines');
  items.forEach(line => {
    if (!hasText(line.name)) missing.push('lines.name');
    if (!hasText(line.qty)) missing.push('lines.qty');
    if (!hasText(line.unitPrice)) missing.push('lines.unitPrice');
  });
  if (!isTaxDocument(document.kind)) return unique(missing);

  const vatPayer = isVatPayer(document, company);
  if (!hasAddress(seller)) missing.push('seller.address');
  if (!hasText(seller.ico)) missing.push('seller.ico');
  if (vatPayer && !hasText(seller.icDph)) missing.push('seller.icDph');
  if (!vatPayer && !hasText(seller.dic) && !hasText(seller.icDph)) missing.push('seller.dic');
  if (!hasText(seller.registerEntry) && !hasText(company && company.registerEntry)) missing.push('seller.registerEntry');
  if (!hasText(buyer.name)) missing.push('buyer.name');
  if (!hasAddress(buyer)) missing.push('buyer.address');
  if (!document.taxDate && document.kind !== 'CREDIT_NOTE' && document.kind !== 'DEBIT_NOTE') missing.push('taxDate');
  if (!document.totals) missing.push('totals');
  if (vatPayer) {
    items.forEach(line => {
      const category = line.vatCategory || 'S';
      if (category === 'S' && !hasText(line.vatRate)) missing.push('lines.vatRate');
    });
    if (document.totals && !Array.isArray(document.totals.breakdown)) missing.push('totals.breakdown');
  }
  if ((document.kind === 'CREDIT_NOTE' || document.kind === 'DEBIT_NOTE') && !(document.links || []).some(l => l.kind === 'CORRECTS')) {
    missing.push('links.corrects');
  }
  return unique(missing);
}

function unique(list) {
  return [...new Set(list)];
}
