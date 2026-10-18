// Daňové priznanie k DPH (§ 78 zákona o DPH; 05-accounting-tax.md § 5.3.1)
// from the VAT records of one period. The amounts are collected under
// stable names (supply.STANDARD.base, deduction.REDUCED_1, ownLiability...)
// and forms/dph.json maps the names to the rows of the form version valid
// for the period, so the row numbers live in data:
//   supply.*        issued supplies with VAT, by rate (cash scheme included)
//   acquisition.*   goods acquired from another member state (§ 11), by rate
//   recipient.*     supplies the company pays the VAT for (§ 69 ods. 2, 3, 12)
//   services693.*   of which services from abroad (§ 69 ods. 3)
//   exempt.base     exempt supplies, intra-EU supplies and exports
//   euGoods.base    of which intra-EU supplies of goods (§ 43)
//   reverseChargeIssued.base  issued supplies under § 69 ods. 12
//   outputTotal, deduction.*, ownLiability, excessDeduction, toPay
// The coefficient (§ 50), corrections of deductions (§ 53, § 54, § 54a),
// self-assessed imports and an excess deduction carried over are not
// computed: the rows stay empty and the screen says so.
import { add, sub, round, sum, cmp, isZero } from '../money/index.js';
import { getLegislation } from '../legislation/index.js';
import { CoreError } from '../errors.js';
import { formVersion, amountText } from './forms.js';
import { problem } from './problems.js';
import { vatReturnXml } from './vat-return-xml.js';

const RECIPIENT = ['DOMESTIC_RC', 'EU_SERVICES', 'THIRD_SERVICES'];
const SERVICES_693 = ['EU_SERVICES', 'THIRD_SERVICES'];
const EXEMPT_OUT = ['EXEMPT', 'EU_GOODS', 'EXPORT'];

// The legislation code (STANDARD, REDUCED_1...) of a rate valid on a date.
function rateCode(rate, date) {
  if (rate === null || rate === undefined) return null;
  const entry = getLegislation('vatRates', date).find(e => cmp(e.rate, rate) === 0);
  return entry ? entry.code : null;
}

/**
 * @param {ReturnType<import('./records.js').vatRecords>} records
 * @param {{company: object, type?: 'R'|'O'|'D', today?: string, discoveredOn?: string}} ctx
 * @returns {{period: string, type: string, amounts: Object<string, string>, rows: Array<{row: string, key: string, amount: string}>, problems: Array, xml: string, form: object}}
 */
export function buildVatReturn(records, ctx = {}) {
  const company = ctx.company || {};
  const form = formVersion('dph', records.from);
  const type = ctx.type || 'R';
  if (!form.filingTypes.includes(type)) throw new CoreError('TAX_FILING_TYPE_INVALID', `unknown filing type ${type}`);
  const problems = [...records.problems];
  if (company.vatMode === 'NONPAYER') problems.push(problem('VAT_RETURN_NOT_REGISTERED', null, { severity: 'error' }));
  if (type === 'D' && !ctx.discoveredOn) problems.push(problem('DISCOVERED_DATE_MISSING', null, { severity: 'error' }));

  const amounts = {};
  const put = (key, value) => { amounts[key] = add(amounts[key] || '0', value); };
  const byRate = (prefix, entry, withVat = true) => {
    const code = rateCode(entry.rate, records.from);
    if (!code) {
      problems.push(problem('RATE_NOT_ON_FORM', { id: entry.docId, number: entry.number, kind: entry.kind }, { severity: 'error', params: { rate: entry.rate ?? '' } }));
      return;
    }
    put(`${prefix}.${code}.base`, entry.base);
    if (withVat) put(`${prefix}.${code}.vat`, entry.vat);
  };

  for (const e of records.entries) {
    if (e.direction === 'OUT') {
      if (e.treatment === 'DOMESTIC') byRate('supply', e);
      else if (EXEMPT_OUT.includes(e.treatment)) put('exempt.base', e.base);
      if (e.treatment === 'EU_GOODS') put('euGoods.base', e.base);
      if (e.treatment === 'DOMESTIC_RC') put('reverseChargeIssued.base', e.base);
      continue;
    }
    if (e.treatment === 'EU_GOODS_ACQ') byRate('acquisition', e);
    if (RECIPIENT.includes(e.treatment)) byRate('recipient', e);
    if (SERVICES_693.includes(e.treatment)) {
      put('services693.base', e.base);
      put('services693.vat', e.vat);
    }
    if (!isZero(e.deductible)) {
      const code = rateCode(e.rate, records.from);
      if (code) put(`deduction.${code}`, e.deductible);
      else problems.push(problem('RATE_NOT_ON_FORM', { id: e.docId, number: e.number, kind: e.kind }, { severity: 'error', params: { rate: e.rate ?? '' } }));
    }
  }

  const output = sum(Object.entries(amounts).filter(([k]) => /^(supply|acquisition|recipient)\.[A-Z_0-9]+\.vat$/.test(k)).map(([, v]) => v));
  const deduction = sum(Object.entries(amounts).filter(([k]) => k.startsWith('deduction.')).map(([, v]) => v));
  amounts.outputTotal = output;
  const balance = sub(output, deduction);
  amounts.ownLiability = cmp(balance, '0') > 0 ? balance : '0';
  amounts.excessDeduction = cmp(balance, '0') < 0 ? sub('0', balance) : '0';
  amounts.toPay = amounts.ownLiability;
  for (const key of Object.keys(amounts)) amounts[key] = amountText(amounts[key]);

  const rows = [];
  for (const [key, row] of Object.entries(form.rows)) {
    if (amounts[key] !== undefined) rows.push({ row, key, amount: amounts[key] });
  }
  for (const key of Object.keys(amounts)) {
    if (!form.rows[key]) problems.push(problem('ROW_NOT_ON_FORM', null, { severity: 'error', params: { key } }));
  }
  rows.sort((a, b) => form.rowOrder.indexOf(a.row) - form.rowOrder.indexOf(b.row));
  const summary = { outputVat: amounts.outputTotal, deduction: round(deduction, 2), ownLiability: amounts.ownLiability, excessDeduction: amounts.excessDeduction };
  const result = { period: records.period, type, amounts, rows, summary, problems, form: { name: form.form, xsd: form.xsdFile, verified: form.verified } };
  result.xml = vatReturnXml(result, company, form, ctx);
  return result;
}
