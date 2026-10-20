// Evidencia DPH (§ 70 zákona o DPH) for one tax period: every issued and
// received document that falls into the period, split into VAT groups,
// in euros, with its treatment. It is the single source of the VAT
// return, the kontrolný výkaz and the súhrnný výkaz (05-accounting-tax.md
// § 5.3), so the three can never disagree.
//
// Which period a document belongs to:
//   issued    the tax point (taxDate, DUZP; a credit or debit note without
//             it: its issue date); under the cash scheme (company.cashBasis,
//             § 68d) the date of each payment received
//   received  the deduction period the user chose (vatDeductionPeriod),
//             else the period it was received in; a self-assessed purchase
//             the period the tax arose in (§ 19, § 20: an intra-EU
//             acquisition on the invoice date, at the latest the 15th day
//             of the next month)
// Problems found on the way are returned with the records, never thrown,
// so the screen can list them all (§ 5.3.4).
import { add, sub, round, sum, isZero, cmp } from '../money/index.js';
import { CoreError } from '../errors.js';
import { parsePeriod, periodOf, periodKindOf, periodContains, isPeriodKey } from './periods.js';
import { documentDirection, partnerOf, partnerCountry, treatmentOf, isSelfAssessed } from './treatment.js';
import { documentGroups, documentSign, toEur, withoutAdvances, selfAssessedVat, paymentShares, signed } from './amounts.js';
import { problem } from './problems.js';
import { isTaxCashVoucher } from './vouchers.js';

const OUT_KINDS = ['INVOICE', 'ADVANCE_TAX_DOC', 'CREDIT_NOTE', 'DEBIT_NOTE', 'SELF_BILLING', 'SALES_RECEIPT'];
const IN_KINDS = ['RECEIVED_INVOICE', 'RECEIVED_CREDIT_NOTE', 'EXPENSE_RECEIPT', 'SELF_BILLING'];
const CORRECTION_KINDS = ['CREDIT_NOTE', 'DEBIT_NOTE', 'RECEIVED_CREDIT_NOTE'];
const SKIPPED_STATUSES = ['DRAFT', 'CANCELLED'];

/** True for a document that may carry VAT for the records. */
export function isRecordable(document) {
  if (!document || document.deleted) return false;
  if (SKIPPED_STATUSES.includes(document.status)) return false;
  return OUT_KINDS.includes(document.kind) || IN_KINDS.includes(document.kind) || isTaxCashVoucher(document);
}

/**
 * @param {Array<object>} documents  all documents of the company (advances
 *   and corrected invoices are looked up among them)
 * @param {string} period  "2026-07" or "2026-Q3"
 * @param {object} company
 * @returns {{period: string, from: string, to: string, kind: string, mode: string, entries: Array<object>, problems: Array<object>, totals: object}}
 */
export function vatRecords(documents, period, company) {
  if (!isPeriodKey(period)) throw new CoreError('TAX_PERIOD_INVALID', `invalid period ${period}`);
  const p = parsePeriod(period);
  const mode = company && company.vatMode ? company.vatMode : 'NONPAYER';
  const all = (documents || []).filter(d => d && !d.deleted);
  const byId = new Map(all.map(d => [d.id, d]));
  const entries = [];
  const problems = [];
  if (mode !== 'NONPAYER') {
    for (const document of all) {
      if (!isRecordable(document)) continue;
      try {
        collect(document, { p, company, mode, byId, entries, problems });
      } catch (e) {
        if (!(e instanceof CoreError)) throw e;
        problems.push(problem(e.code, document, { severity: 'error' }));
      }
    }
  }
  entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.number || '').localeCompare(String(b.number || ''))));
  return { period: p.key, from: p.from, to: p.to, kind: p.kind, mode, entries, problems: dedupe(problems), totals: recordTotals(entries) };
}

function collect(document, ctx) {
  const { company } = ctx;
  const direction = documentDirection(document, company);
  const voucher = isTaxCashVoucher(document);
  if (!voucher && direction === 'IN' && !IN_KINDS.includes(document.kind)) return;
  if (!voucher && direction === 'OUT' && !OUT_KINDS.includes(document.kind)) return;
  const partner = partnerOf(document, direction);
  let groups = documentGroups(document);
  if (direction === 'OUT' && document.kind === 'INVOICE') groups = withoutAdvances(groups, advancesOf(document, ctx.byId));
  const sign = documentSign(document, groups);
  const gross = sum(documentGroups(document).map(g => add(g.base, g.vat)));
  const base = baseEntry(document, direction, partner, ctx);

  for (const group of groups) {
    const treatment = treatmentOf(group, direction, partner, company);
    if (treatment === 'INVALID') {
      ctx.problems.push(problem('CATEGORY_PARTNER_MISMATCH', document, { severity: 'error' }));
      continue;
    }
    const cash = company.cashBasis && company.vatMode === 'PAYER' && treatment === 'DOMESTIC' && !CORRECTION_KINDS.includes(document.kind);
    if (cash) {
      const payments = [...(document.payments || [])].filter(x => !x.deleted && (!x.currency || x.currency === document.currency))
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      for (const share of paymentShares([group], gross, payments, (date) => date >= ctx.p.from && date <= ctx.p.to)) {
        for (const g of share.groups) push(ctx, document, { ...base, date: share.payment.date, paymentId: share.payment.id }, g, treatment, sign);
      }
      continue;
    }
    const placed = placement(document, direction, treatment, ctx);
    // A document with no date at all belongs to no period: every period
    // reports it, so it is dated before filing instead of vanishing.
    if (!placed.inside && placed.undated) placed.problems.forEach(x => ctx.problems.push(x));
    if (!placed.inside) continue;
    placed.problems.forEach(x => ctx.problems.push(x));
    push(ctx, document, { ...base, date: placed.date }, group, treatment, sign);
  }
}

function baseEntry(document, direction, partner, ctx) {
  const correction = CORRECTION_KINDS.includes(document.kind);
  const original = correction ? correctedDocument(document, ctx.byId) : null;
  return {
    docId: document.id,
    number: document.number || null,
    kind: document.kind,
    direction,
    partner: {
      name: partner.name || '',
      icDph: compact(partner.icDph),
      dic: compact(partner.dic),
      ico: compact(partner.ico),
      country: partnerCountry(partner)
    },
    issueDate: document.issueDate || null,
    taxDate: document.taxDate || null,
    receivedDate: document.receivedDate || null,
    correction,
    originalDocId: original ? original.id : null,
    originalNumber: original ? original.number || null : null,
    ekasa: document.kind === 'SALES_RECEIPT',
    // An expense paid from the cash desk rests on the supplier's receipt or
    // simplified invoice: B.3 of the kontrolný výkaz, like an expense receipt.
    simplified: document.kind === 'EXPENSE_RECEIPT' || document.kind === 'CASH_OUT',
    cashVoucher: isTaxCashVoucher(document),
    paymentId: null
  };
}

function push(ctx, document, base, group, treatment, sign) {
  const { mode } = ctx;
  const euroBase = signed(toEur(group.base, document), sign);
  let vat = signed(toEur(group.vat, document), sign);
  let rate = group.rate;
  let deductible = '0.00';
  const direction = base.direction;
  if (isSelfAssessed(treatment, direction)) {
    const assessed = selfAssessedVat(euroBase, group.rate, base.date);
    rate = assessed.rate;
    vat = assessed.vat;
    deductible = mode === 'PAYER' ? vat : '0.00';
  } else if (direction === 'IN') {
    deductible = mode === 'PAYER' && (treatment === 'DOMESTIC' || treatment === 'IMPORT') ? vat : '0.00';
  }
  if (direction === 'OUT' && mode === 'REGISTERED_7' && treatment === 'DOMESTIC' && !isZero(vat)) {
    ctx.problems.push(problem('REGISTERED_7_CHARGES_VAT', document, { severity: 'warning' }));
  }
  if (base.correction && !base.originalNumber) ctx.problems.push(problem('CORRECTION_ORIGINAL_MISSING', document, { severity: 'error' }));
  if (treatment === 'FOREIGN') ctx.problems.push(problem('FOREIGN_VAT', document, { severity: 'warning' }));
  ctx.entries.push({ ...base, treatment, category: group.category, rate: rate ?? null, base: euroBase, vat, deductible });
}

// Where a document falls and the problems of its dates.
function placement(document, direction, treatment, ctx) {
  const { p, company } = ctx;
  const kind = periodKindOf(company);
  const problems = [];
  const inside = (date) => date >= p.from && date <= p.to;
  if (direction === 'OUT' && treatment === 'EU_GOODS') {
    const date = intraEuGoodsDate(document);
    if (!document.taxDate) problems.push(problem('TAX_DATE_MISSING', document, { severity: 'error' }));
    return date ? { inside: inside(date), date, problems } : { inside: false, undated: true, problems };
  }
  if (direction === 'OUT') {
    let date = document.taxDate;
    if (!date) {
      date = document.issueDate;
      if (!CORRECTION_KINDS.includes(document.kind) && document.kind !== 'SALES_RECEIPT') problems.push(problem('TAX_DATE_MISSING', document, { severity: 'error' }));
    }
    if (!date) return { inside: false, undated: true, problems };
    return { inside: inside(date), date, problems };
  }
  if (isSelfAssessed(treatment, direction)) {
    const date = selfAssessedDate(document, treatment);
    if (!date) return { inside: false, undated: true, problems: [problem('TAX_DATE_MISSING', document, { severity: 'error' })] };
    if (!document.taxDate) problems.push(problem('TAX_DATE_MISSING', document, { severity: 'error' }));
    return { inside: inside(date), date, problems };
  }
  // An expense voucher is received on the day it is paid.
  const received = document.receivedDate || (document.kind === 'CASH_OUT' ? document.issueDate || null : null);
  if (!received) problems.push(problem('RECEIVED_DATE_MISSING', document, { severity: 'error' }));
  const date = received || document.issueDate || document.taxDate;
  if (!date) return { inside: false, undated: true, problems };
  const chosen = document.vatDeductionPeriod;
  if (chosen) {
    // A deduction period of the other length counts in the company's own
    // period that holds its end: a quarter in its last month, a month in
    // its quarter.
    const effective = periodOf(parsePeriod(chosen).to, kind);
    if (parsePeriod(chosen).kind !== kind) problems.push(problem('DEDUCTION_PERIOD_KIND', document, { severity: 'warning' }));
    if (parsePeriod(chosen).to < date) problems.push(problem('DEDUCTION_PERIOD_TOO_EARLY', document, { severity: 'error' }));
    return { inside: periodContains(p.key, effective), date, problems };
  }
  return { inside: periodOf(date, kind) === p.key, date, problems };
}

// § 19: a self-assessed supply is taxed on delivery; an acquisition of
// goods from another member state by § 20 (see intraEuGoodsDate).
function selfAssessedDate(document, treatment) {
  return treatment === 'EU_GOODS_ACQ' ? intraEuGoodsDate(document) : document.taxDate || document.issueDate || null;
}

// § 20: a supply or acquisition of goods between member states is taxed on
// the day the invoice is issued, at the latest on the 15th day of the
// month after the delivery.
function intraEuGoodsDate(document) {
  const delivery = document.taxDate || null;
  if (!delivery) return document.issueDate || null;
  const [y, m] = delivery.split('-').map(Number);
  const limit = m === 12 ? `${y + 1}-01-15` : `${y}-${String(m + 1).padStart(2, '0')}-15`;
  const issued = document.issueDate || limit;
  return issued < limit ? (issued < delivery ? delivery : issued) : limit;
}

// Advance tax documents deducted on a final invoice: linked directly, or
// through the proforma they were issued for.
function advancesOf(invoice, byId) {
  const out = [];
  for (const link of invoice.links || []) {
    if (link.kind !== 'ADVANCE_DEDUCTION') continue;
    const target = byId.get(link.docId);
    if (!target) continue;
    const advances = target.kind === 'ADVANCE_TAX_DOC'
      ? [target]
      : [...byId.values()].filter(d => d.kind === 'ADVANCE_TAX_DOC' && !d.deleted && d.status !== 'CANCELLED' && d.status !== 'DRAFT' && (d.links || []).some(l => l.kind === 'FROM_PROFORMA' && l.docId === target.id));
    for (const advance of advances) {
      const groups = documentGroups(advance);
      const gross = round(sum(groups.map(g => add(g.base, g.vat))), 2);
      const amount = target.kind === 'ADVANCE_TAX_DOC' && link.amount && cmp(link.amount, gross) < 0 ? link.amount : null;
      out.push({ groups, gross, amount });
    }
  }
  return out;
}

function correctedDocument(document, byId) {
  const link = (document.links || []).find(l => l.kind === 'CORRECTS');
  return link ? byId.get(link.docId) || null : null;
}

function compact(value) {
  return value ? String(value).replace(/\s+/g, '').toUpperCase() : null;
}

function dedupe(problems) {
  const seen = new Set();
  return problems.filter(x => {
    const key = `${x.code}|${x.docId || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Output VAT, deductible VAT and the bases of the records. */
export function recordTotals(entries) {
  const of = (list, field) => round(sum(list.map(e => e[field])), 2);
  const out = entries.filter(e => e.direction === 'OUT');
  const selfAssessed = entries.filter(e => isSelfAssessed(e.treatment, e.direction));
  const outputVat = round(add(of(out.filter(e => e.treatment === 'DOMESTIC'), 'vat'), of(selfAssessed, 'vat')), 2);
  const deductibleVat = of(entries.filter(e => e.direction === 'IN'), 'deductible');
  return {
    outputVat,
    deductibleVat,
    balance: round(sub(outputVat, deductibleVat), 2),
    outBase: of(out, 'base'),
    inBase: of(entries.filter(e => e.direction === 'IN'), 'base'),
    count: new Set(entries.map(e => e.docId)).size
  };
}
