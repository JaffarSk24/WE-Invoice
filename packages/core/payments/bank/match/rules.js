// Matching rules for one transaction and one document (03-features.md
// § 3.9), strongest first:
//   VS + amount              100  exact payment
//   IBAN + amount             90
//   VS, other amount          85  partial payment or overpayment
//   number in message         80  (70 with another amount)
//   amount + name             60  a suggestion only
//   IBAN, other amount        50  only when the party has one open document
// Every proposal carries its reasons as codes, so the interface explains
// it in the user's language, and the amount it would record.
import { abs, round, cmp, sub } from '../../../money/index.js';
import { docVs, partyIban, partyOf, namesMatch, searchText, digitRuns } from './candidates.js';

export const CONFIDENCE = Object.freeze({
  VS_AMOUNT: 100, IBAN_AMOUNT: 90, VS_OTHER_AMOUNT: 85, NUMBER: 80, NUMBER_OTHER_AMOUNT: 70, NAME_AMOUNT: 60, IBAN_OTHER_AMOUNT: 50
});

/** Confidence from which a proposal is ticked in the confirmation dialog. */
export const PRESELECT_FROM = 90;

function kindOf(paid, open) {
  const c = cmp(paid, open);
  if (c === 0) return 'EXACT';
  return c < 0 ? 'PARTIAL' : 'OVERPAID';
}

function numberInText(doc, text) {
  const number = String(doc.number || '').toUpperCase().replace(/[\s-]/g, '');
  return number.length >= 4 && text.includes(number);
}

/** What ties a transaction to one candidate: the facts the rules use. */
export function evidence(tx, candidate, openByParty = 1) {
  const paid = round(abs(tx.amount), 2);
  const vs = docVs(candidate.doc);
  const iban = partyIban(candidate);
  const party = partyOf(candidate.doc);
  const names = [candidate.contact?.name, party?.name].filter(Boolean);
  return {
    paid,
    amount: cmp(paid, candidate.open) === 0,
    vs: Boolean(vs && tx.vs && vs === tx.vs),
    vsInText: Boolean(vs && !tx.vs && vs.length >= 4 && digitRuns(tx).has(vs)),
    iban: Boolean(iban && tx.counterpartyIban && iban === tx.counterpartyIban),
    number: numberInText(candidate.doc, searchText(tx)),
    name: Boolean(tx.counterpartyName && names.some(n => namesMatch(n, tx.counterpartyName))),
    soleOpen: openByParty === 1
  };
}

/**
 * The best rule that fits, as a proposal, or null.
 * @returns {{docId: string, docIds: string[], confidence: number, reason: string, reasons: string[], kind: string,
 *   allocations: Array<{docId: string, amount: string}>, difference: string}|null}
 */
export function scoreCandidate(tx, candidate, openByParty = 1) {
  const e = evidence(tx, candidate, openByParty);
  const extra = [e.iban && 'IBAN', e.name && 'NAME'].filter(Boolean);
  let rule = null;
  let reasons = [];
  if (e.vs && e.amount) { rule = 'VS_AMOUNT'; reasons = ['VS', 'AMOUNT', ...extra]; }
  else if (e.iban && e.amount) { rule = 'IBAN_AMOUNT'; reasons = ['IBAN', 'AMOUNT', ...(e.name ? ['NAME'] : [])]; }
  else if (e.vs) { rule = 'VS_OTHER_AMOUNT'; reasons = ['VS', ...extra]; }
  else if ((e.number || e.vsInText) && e.amount) { rule = 'NUMBER'; reasons = [e.number ? 'NUMBER' : 'VS_IN_TEXT', 'AMOUNT', ...extra]; }
  else if (e.number || e.vsInText) { rule = 'NUMBER_OTHER_AMOUNT'; reasons = [e.number ? 'NUMBER' : 'VS_IN_TEXT', ...extra]; }
  else if (e.name && e.amount) { rule = 'NAME_AMOUNT'; reasons = ['NAME', 'AMOUNT']; }
  else if (e.iban && e.soleOpen) { rule = 'IBAN_OTHER_AMOUNT'; reasons = ['IBAN', ...(e.name ? ['NAME'] : [])]; }
  if (!rule) return null;
  return {
    docId: candidate.doc.id,
    docIds: [candidate.doc.id],
    confidence: CONFIDENCE[rule],
    reason: rule,
    reasons,
    kind: kindOf(e.paid, candidate.open),
    allocations: [{ docId: candidate.doc.id, amount: e.paid }],
    difference: round(sub(e.paid, candidate.open), 2)
  };
}
