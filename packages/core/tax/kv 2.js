// Kontrolný výkaz DPH (§ 78a zákona o DPH; 05-accounting-tax.md § 5.3.2)
// from the VAT records of one period. Sections:
//   A.1  issued invoices with VAT to a Slovak VAT payer, per invoice and rate
//   A.2  issued invoices under reverse charge (§ 69 ods. 12), per invoice;
//        their corrections with a negative base
//   B.1  received documents the company self-assesses (§ 69 ods. 2, 3, 12,
//        § 11 acquisitions), per document and rate; corrections negative
//   B.2  received invoices with VAT deducted, per invoice and rate
//   B.3  simplified invoices and eKasa receipts deducted: B.3.1 in one sum
//        while their deducted VAT stays under the form's threshold
//        (3000 EUR), B.3.2 per supplier from it on
//   C.1  issued credit and debit notes to VAT payers (corrections of A.1)
//   C.2  received credit notes (corrections of B.2)
//   D.1  sales through the cash register (eKasa), sums by rate
//   D.2  other issued documents with VAT (buyers without a Slovak VAT id),
//        sums by rate
// Kinds of filing: R riadny, O opravný (replaces one filed before the
// deadline), D dodatočný (after the deadline). The XML is built by
// kv-xml.js; the layout version and the threshold come from forms/kv.json.
import { add, round, sum, cmp, isZero } from '../money/index.js';
import { isValidVatId } from '../ids/validate.js';
import { getLegislation } from '../legislation/index.js';
import { CoreError } from '../errors.js';
import { formVersion, rateText, amountText } from './forms.js';
import { problem, canExport } from './problems.js';
import { kvXml } from './kv-xml.js';

export const FILING_TYPES = Object.freeze(['R', 'O', 'D']);

const isSkPayer = (partner) => Boolean(partner.icDph) && partner.icDph.startsWith('SK');

// Sums entries grouped by a key; amounts stay decimal strings.
function groupBy(entries, keyOf, make) {
  const map = new Map();
  for (const e of entries) {
    const key = keyOf(e);
    if (!map.has(key)) map.set(key, { ...make(e), base: '0', vat: '0', deductible: '0' });
    const row = map.get(key);
    row.base = add(row.base, e.base);
    row.vat = add(row.vat, e.vat);
    row.deductible = add(row.deductible, e.deductible);
  }
  return [...map.values()].map(r => ({ ...r, base: amountText(r.base), vat: amountText(r.vat), deductible: amountText(r.deductible) }));
}

const perDocument = (e) => `${e.docId}|${e.rate ?? ''}|${e.paymentId || ''}`;

function docRow(e, partnerField) {
  return {
    docId: e.docId,
    kind: e.kind,
    [partnerField]: e.partner.icDph || '',
    number: e.number || '',
    date: e.date,
    rate: rateText(e.rate)
  };
}

// D.1 and D.2 are sums by rate; the XML folds them into the columns of
// forms/kv.json (see kv-xml.js).
function rateTotals(entries) {
  return groupBy(entries, e => rateText(e.rate) || '', e => ({ rate: rateText(e.rate) }))
    .filter(r => !(isZero(r.base) && isZero(r.vat)))
    .sort((a, b) => cmp(b.rate || '0', a.rate || '0'));
}

// The legislation code (STANDARD, REDUCED_1, REDUCED_2) of a rate on a date.
export function rateCodeOn(rate, date) {
  if (rate === null || rate === undefined || rate === '') return null;
  const entry = getLegislation('vatRates', date).find(e => cmp(e.rate, rate) === 0);
  return entry ? entry.code : null;
}

/**
 * @param {ReturnType<import('./records.js').vatRecords>} records
 * @param {{company: object, type?: 'R'|'O'|'D', today?: string}} ctx
 * @returns {{period: string, type: string, sections: object, problems: Array, xml: string|null, form: object}}
 */
export function buildKv(records, ctx = {}) {
  const company = ctx.company || {};
  const type = ctx.type || 'R';
  if (!FILING_TYPES.includes(type)) throw new CoreError('TAX_FILING_TYPE_INVALID', `unknown filing type ${type}`);
  const form = formVersion('kv', records.from);
  const problems = [...records.problems];
  if (company.vatMode !== 'PAYER') problems.push(problem('KV_NOT_PAYER', null, { severity: 'error' }));
  const abolished = getLegislation('einvoice.kvAbolishedFrom', records.from);
  if (abolished && records.from >= abolished) problems.push(problem('KV_ABOLISHED', null, { severity: 'error' }));

  const entries = records.entries;
  const out = entries.filter(e => e.direction === 'OUT');
  const inn = entries.filter(e => e.direction === 'IN');
  const domesticOut = out.filter(e => e.treatment === 'DOMESTIC');

  const a1 = groupBy(domesticOut.filter(e => !e.correction && !e.ekasa && isSkPayer(e.partner)), perDocument, e => docRow(e, 'buyer'));
  const a2 = groupBy(out.filter(e => e.treatment === 'DOMESTIC_RC'), perDocument, e => ({ ...docRow(e, 'buyer'), rate: null }));
  const b1 = groupBy(inn.filter(e => ['DOMESTIC_RC', 'EU_GOODS_ACQ', 'EU_SERVICES', 'THIRD_SERVICES'].includes(e.treatment)), perDocument, e => docRow(e, 'supplier'));
  const deducted = inn.filter(e => e.treatment === 'DOMESTIC' && !isZero(e.deductible));
  const b2 = groupBy(deducted.filter(e => !e.simplified && !e.correction), perDocument, e => ({ ...docRow(e, 'supplier'), date: e.taxDate || e.issueDate || e.date }));
  const simplified = deducted.filter(e => e.simplified && !e.correction);
  const simplifiedVat = round(sum(simplified.map(e => e.deductible)), 2);
  const perSupplier = cmp(simplifiedVat, form.simplifiedPerSupplierFrom) >= 0;
  const b3 = {
    perSupplier,
    total: simplified.length ? groupBy(simplified, () => 'all', () => ({}))[0] : null,
    suppliers: perSupplier ? groupBy(simplified, e => e.partner.icDph || '', e => ({ supplier: e.partner.icDph || '' })).sort((a, b) => a.supplier.localeCompare(b.supplier)) : []
  };
  const correctionRow = (e, field) => ({ docId: e.docId, kind: e.kind, [field]: e.partner.icDph || '', number: e.number || '', original: e.originalNumber || '', rate: rateText(e.rate) });
  const c1 = groupBy(domesticOut.filter(e => e.correction && isSkPayer(e.partner)), perDocument, e => correctionRow(e, 'buyer'));
  const c2 = groupBy(deducted.filter(e => e.correction), perDocument, e => correctionRow(e, 'supplier'));
  const d1 = rateTotals(domesticOut.filter(e => e.ekasa));
  const d2 = rateTotals(domesticOut.filter(e => !e.ekasa && !isSkPayer(e.partner)));

  for (const row of [...d1, ...d2]) {
    row.code = rateCodeOn(row.rate, records.from);
    if (!row.code || !form.rateColumns[row.code]) problems.push(problem('RATE_NOT_ON_FORM', null, { severity: 'error', params: { rate: row.rate ?? '' } }));
  }
  checkPartners(entries, problems);
  checkRows({ b1, b2, c2, b3 }, problems);
  const sections = { A1: a1, A2: a2, B1: b1, B2: b2, B3: b3, C1: c1, C2: c2, D1: d1, D2: d2 };
  const result = { period: records.period, type, sections, problems, form: { name: form.form, xsd: form.xsdFile, verified: form.verified } };
  // No XML while an error is open: the schema has no place for a missing
  // VAT id, number or original invoice.
  result.xml = canExport(problems) ? kvXml(result, records, company, form) : null;
  return result;
}

// Partner ids every listed row needs (§ 5.3.4: missing or invalid IČ DPH).
function checkPartners(entries, problems) {
  const seen = new Set();
  for (const e of entries) {
    if (seen.has(e.docId)) continue;
    const needsId = (e.direction === 'IN' && e.treatment === 'DOMESTIC' && !e.simplified && !isZero(e.deductible))
      || (e.direction === 'OUT' && e.treatment === 'DOMESTIC_RC')
      || (e.direction === 'IN' && e.treatment === 'DOMESTIC_RC');
    const doc = { id: e.docId, number: e.number, kind: e.kind };
    if (needsId && !e.partner.icDph) {
      problems.push(problem('PARTNER_VAT_ID_MISSING', doc, { severity: 'error' }));
      seen.add(e.docId);
    } else if (e.partner.icDph && e.partner.country === 'SK' && !isValidVatId(e.partner.icDph)) {
      problems.push(problem('PARTNER_VAT_ID_INVALID', doc, { severity: 'error', params: { id: e.partner.icDph } }));
      seen.add(e.docId);
    } else if (!e.number && e.direction === 'OUT') {
      problems.push(problem('DOCUMENT_NUMBER_MISSING', doc, { severity: 'error' }));
      seen.add(e.docId);
    }
  }
}

// Rows of received documents: the schema needs the supplier's invoice
// number, and B.3.2 the supplier's VAT id. A supplier from outside the EU
// without a VAT id is listed in B.1 without one (a warning to check).
function checkRows({ b1, b2, c2, b3 }, problems) {
  const doc = (r) => ({ id: r.docId, number: r.number, kind: r.kind });
  for (const r of [...b1, ...b2, ...c2]) {
    if (!r.number) problems.push(problem('DOCUMENT_NUMBER_MISSING', doc(r), { severity: 'error' }));
  }
  for (const r of b1) {
    if (!r.supplier) problems.push(problem('B1_SUPPLIER_WITHOUT_VAT_ID', doc(r), { severity: 'warning' }));
  }
  if (b3.perSupplier && b3.suppliers.some(r => !r.supplier)) problems.push(problem('PARTNER_VAT_ID_MISSING', null, { severity: 'error' }));
}
