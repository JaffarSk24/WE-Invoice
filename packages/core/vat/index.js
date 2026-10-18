// Document totals by EN 16931 (04-peppol.md § 4.4), WP-CORE. computeTotals()
// is the only place totals are computed: the editor, the PDF, UBL and every
// report call it, so they can never disagree.
//
// Conventions: amounts are decimal strings in the document currency;
// document.fxRate is the ECB style quote (units of document currency per
// 1 EUR), so BT-111 (VAT in EUR) is vat / fxRate. Prepaid amounts (BT-113)
// come from options.prepaid or from ADVANCE_DEDUCTION links. Cash rounding
// (BT-114) is applied on request, with the step from legislation, or taken
// from document.rounding when the user set it by hand.
import { add, sub, mul, div, round, roundCash, sum } from '../money/index.js';
import { getLegislation } from '../legislation/index.js';
import { lineAmounts, isItemLine } from './lines.js';
import { allocateDocDiscount } from './allocate.js';

export { lineNet, grossToNet, normalizeVat, unitNetPrice, lineAmounts, isItemLine } from './lines.js';
export { allocateDocDiscount } from './allocate.js';

const ZERO = '0.00';

/**
 * @param {import('../schema/types.js').Document} document
 * @param {{prepaid?: string, cashRounding?: boolean, date?: string, country?: string}} [options]
 *   prepaid: BT-113 override; cashRounding: round the payable amount to the
 *   legal cash step; date: legislation date (defaults to taxDate, then
 *   issueDate); country: legislation country, SK by default.
 * @returns {import('../schema/types.js').Totals & {
 *   lines: Array<object>, docAllowances: Array<{category: string, rate: string|null, amount: string, charge: boolean}>
 * }}
 */
export function computeTotals(document, options = {}) {
  const lines = (document.lines || []).filter(isItemLine).map(lineAmounts);

  // BG-23 groups in order of first appearance.
  const groups = [];
  const byKey = new Map();
  for (const line of lines) {
    const key = `${line.category}|${line.rate ?? ''}`;
    let group = byKey.get(key);
    if (!group) {
      group = { key, category: line.category, rate: line.rate, lineNet: '0', exemptionReasonCode: null, exemptionReasonText: null };
      byKey.set(key, group);
      groups.push(group);
    }
    group.lineNet = add(group.lineNet, line.net);
    // The first reason given on a line of the group names the group (BT-120 / BT-121).
    if (!group.exemptionReasonCode && !group.exemptionReasonText && (line.exemptionReasonCode || line.exemptionReasonText)) {
      group.exemptionReasonCode = line.exemptionReasonCode;
      group.exemptionReasonText = line.exemptionReasonText;
    }
  }

  const { allowances, charges } = allocateDocDiscount(groups, document.docDiscount);
  const docAllowances = [];
  const breakdown = groups.map(group => {
    const allowance = allowances[group.key] || ZERO;
    const charge = charges[group.key] || ZERO;
    if (allowance !== ZERO) docAllowances.push({ category: group.category, rate: group.rate, amount: allowance, charge: false });
    if (charge !== ZERO) docAllowances.push({ category: group.category, rate: group.rate, amount: charge, charge: true });
    const base = round(add(sub(group.lineNet, allowance), charge), 2);
    const vat = group.category === 'S' ? round(div(mul(base, group.rate), '100', 10), 2) : ZERO;
    return {
      category: group.category,
      rate: group.rate,
      base,
      vat,
      allowance,
      charge,
      exemptionReasonCode: group.exemptionReasonCode,
      exemptionReasonText: group.exemptionReasonText
    };
  });

  const lineNetTotal = round(sum(lines.map(l => l.net)), 2); // BT-106
  const allowanceTotal = round(sum(Object.values(allowances)), 2); // BT-107
  const chargeTotal = round(sum(Object.values(charges)), 2); // BT-108
  const net = round(add(sub(lineNetTotal, allowanceTotal), chargeTotal), 2); // BT-109
  const vat = round(sum(breakdown.map(b => b.vat)), 2); // BT-110
  const gross = round(add(net, vat), 2); // BT-112
  const prepaid = round(prepaidAmount(document, options), 2); // BT-113
  const beforeRounding = sub(gross, prepaid);
  const rounding = roundingAmount(document, options, beforeRounding); // BT-114
  const payable = round(add(beforeRounding, rounding), 2); // BT-115

  return {
    lineNet: lineNetTotal,
    allowances: allowanceTotal,
    charges: chargeTotal,
    net,
    vat,
    vatEur: vatInEur(document, vat), // BT-111
    gross,
    prepaid,
    rounding,
    payable,
    breakdown,
    lines,
    docAllowances
  };
}

function prepaidAmount(document, options) {
  if (options.prepaid !== undefined && options.prepaid !== null) return options.prepaid;
  const links = (document.links || []).filter(l => l.kind === 'ADVANCE_DEDUCTION' && l.amount);
  return links.length ? sum(links.map(l => l.amount)) : '0';
}

function roundingAmount(document, options, amount) {
  if (document.rounding !== null && document.rounding !== undefined && document.rounding !== '') return round(document.rounding, 2);
  if (!options.cashRounding) return ZERO;
  const date = options.date || document.taxDate || document.issueDate;
  const step = date ? getLegislation('cashRounding.step', date, options.country || 'SK') : undefined;
  return round(roundCash(amount, step).rounding, 2);
}

function vatInEur(document, vat) {
  if (!document.currency || document.currency === 'EUR') return null;
  if (!document.fxRate) return null;
  return round(div(vat, document.fxRate, 10), 2);
}

/**
 * VAT rates valid on a date, from legislation.
 * @returns {Array<{code: string, rate: string}>}
 */
export function vatRatesOn(date, country = 'SK') {
  return getLegislation('vatRates', date, country).map(({ code, rate }) => ({ code, rate }));
}
