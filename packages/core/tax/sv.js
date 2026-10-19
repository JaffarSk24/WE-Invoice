// Súhrnný výkaz DPH (§ 80 zákona o DPH; 05-accounting-tax.md § 5.3.3)
// from the VAT records: supplies of goods to buyers registered for VAT in
// another member state (§ 43, code 0) and services taxed there by the
// buyer (§ 15 ods. 1, code 2), summed per buyer VAT id and code. A credit
// note lowers the value in the period it is issued in. The buyer's VAT id
// must be valid in VIES before filing: the caller passes the results it
// has (ctx.vies), the core only reads them.
// Kinds of filing: R riadny, O opravný (§ 80 ods. 5).
import { add, isZero } from '../money/index.js';
import { isValidVatId } from '../ids/validate.js';
import { CoreError } from '../errors.js';
import { formVersion, amountText } from './forms.js';
import { problem } from './problems.js';
import { svXml } from './sv-xml.js';

const SV_TREATMENTS = ['EU_GOODS', 'EU_SERVICES'];

/** Splits a VAT id into the VIES country code and the number ("DE123" -> ["DE", "123"]). */
export function splitVatId(vatId) {
  const s = String(vatId || '').replace(/\s+/g, '').toUpperCase();
  return [s.slice(0, 2), s.slice(2)];
}

/**
 * @param {ReturnType<import('./records.js').vatRecords>} records  records of the SV period
 * @param {{company: object, type?: 'R'|'O', vies?: Object<string, 'VALID'|'INVALID'|'UNKNOWN'>, today?: string}} ctx
 * @returns {{period: string, type: string, rows: Array, problems: Array, xml: string, form: object}}
 */
export function buildSv(records, ctx = {}) {
  const company = ctx.company || {};
  const form = formVersion('sv', records.from);
  const type = ctx.type || 'R';
  if (!form.filingTypes.includes(type)) throw new CoreError('TAX_FILING_TYPE_INVALID', `unknown SV filing type ${type}`);
  const problems = [];
  if (company.vatMode === 'NONPAYER') problems.push(problem('SV_NOT_REGISTERED', null, { severity: 'error' }));
  const vies = ctx.vies || {};
  const map = new Map();
  for (const e of records.entries) {
    if (e.direction !== 'OUT' || !SV_TREATMENTS.includes(e.treatment)) continue;
    const doc = { id: e.docId, number: e.number, kind: e.kind };
    const id = e.partner.icDph;
    if (!id) {
      problems.push(problem('PARTNER_VAT_ID_MISSING', doc, { severity: 'error' }));
      continue;
    }
    if (id.startsWith('SK')) {
      problems.push(problem('SV_DOMESTIC_BUYER', doc, { severity: 'error', params: { id } }));
      continue;
    }
    if (!isValidVatId(id)) problems.push(problem('PARTNER_VAT_ID_INVALID', doc, { severity: 'error', params: { id } }));
    if (vies[id] === 'INVALID') problems.push(problem('VIES_INVALID', doc, { severity: 'error', params: { id } }));
    else if (vies[id] !== 'VALID') problems.push(problem('VIES_NOT_CHECKED', doc, { severity: 'warning', params: { id } }));
    const code = form.supplyCodes[e.treatment];
    const key = `${id}|${code}`;
    if (!map.has(key)) {
      const [country, number] = splitVatId(id);
      map.set(key, { vatId: id, country, number, code, value: '0', docIds: [] });
    }
    const row = map.get(key);
    row.value = add(row.value, e.base);
    if (!row.docIds.includes(e.docId)) row.docIds.push(e.docId);
  }
  const rows = [...map.values()]
    .map(r => ({ ...r, value: amountText(r.value) }))
    .filter(r => !isZero(r.value))
    .sort((a, b) => a.vatId.localeCompare(b.vatId) || a.code.localeCompare(b.code));
  const result = { period: records.period, type, rows, problems: dedupe(problems), form: { name: form.form, xsd: form.xsdFile, verified: form.verified } };
  result.xml = svXml(result, company, form, ctx.today || null);
  return result;
}

function dedupe(problems) {
  const seen = new Set();
  return problems.filter(p => {
    const key = `${p.code}|${p.docId || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
