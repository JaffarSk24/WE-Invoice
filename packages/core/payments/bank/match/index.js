// Matching bank transactions with documents: every rule over every open
// document, the multi-document proposals, then the best few, strongest
// first. matchStatement walks a whole statement in date order and
// reserves what a confident proposal would pay, so a later line does not
// claim the same open amount twice. Nothing is recorded here: the user
// confirms proposals and apply.js turns them into payments. A movement
// that pays what the user already recorded by hand is proposed as that
// payment (allocation.paymentId), so confirming ties the two together
// instead of paying the document twice.
import { candidatesFor, recordedFor, partyIban, partyOf } from './candidates.js';
import { scoreCandidate, PRESELECT_FROM, CONFIDENCE } from './rules.js';
import { multiProposals } from './combine.js';
import { add } from '../../../money/index.js';

const MAX_PROPOSALS = 5;

function openPerParty(candidates) {
  const counts = new Map();
  const keyOf = (c) => partyIban(c) || c.doc.contactId || partyOf(c.doc)?.name || c.doc.id;
  candidates.forEach(c => counts.set(keyOf(c), (counts.get(keyOf(c)) || 0) + 1));
  return (c) => counts.get(keyOf(c)) || 1;
}

/**
 * Match proposals for one transaction (VS + amount 100, IBAN + amount 90,
 * VS with another amount 85, number in message 80, amount + name 60), plus
 * multi-document ones, strongest first.
 * @param {object} tx  a bankTransactions record or a parsed transaction
 * @param {object[]} documents
 * @param {object[]} [contacts]
 * @param {{pending?: Map<string, string>}} [options]  open amounts already reserved per document
 * @returns {Array<{docId: string, docIds: string[], confidence: number, reason: string, reasons: string[], kind: string,
 *   allocations: Array<{docId: string, amount: string}>, difference: string}>}
 */
export function matchBankTx(tx, documents, contacts = [], options = {}) {
  if (!tx || !tx.amount) return [];
  const candidates = candidatesFor(tx, documents, contacts, options.pending);
  const perParty = openPerParty(candidates);
  const single = candidates.map(c => scoreCandidate(tx, c, perParty(c))).filter(Boolean);
  const recorded = recordedFor(tx, documents, contacts, options.taken).map(c => recordedProposal(tx, c)).filter(Boolean);
  const all = [...single, ...multiProposals(tx, candidates), ...recorded];
  const seen = new Set();
  return all
    // An open document goes before a payment recorded by hand at the same confidence.
    .sort((a, b) => b.confidence - a.confidence || Number(Boolean(a.recorded)) - Number(Boolean(b.recorded)) || a.docIds.length - b.docIds.length)
    .filter(p => {
      const key = p.docIds.slice().sort().join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_PROPOSALS);
}

// A payment recorded by hand counts only for an exact amount and with
// something more that ties it to the movement (VS, IBAN, number, name).
function recordedProposal(tx, candidate) {
  const p = scoreCandidate(tx, candidate, 1);
  if (!p || p.kind !== 'EXACT' || p.confidence < CONFIDENCE.NAME_AMOUNT || p.reason === 'IBAN_OTHER_AMOUNT') return null;
  return {
    ...p, recorded: true, reasons: [...p.reasons, 'RECORDED'],
    allocations: p.allocations.map(a => ({ ...a, paymentId: candidate.paymentId }))
  };
}

/**
 * Proposals for every unconfirmed transaction of a statement. A proposal
 * of PRESELECT_FROM or more is preselected and reserves its allocations.
 * @returns {Array<{tx: object, proposals: object[], preselected: object|null}>}
 */
export function matchStatement(transactions, documents, contacts = []) {
  const pending = new Map();
  const taken = new Set();
  const ordered = transactions
    .map((tx, index) => ({ tx, index }))
    .sort((a, b) => String(a.tx.date).localeCompare(String(b.tx.date)) || a.index - b.index);
  const results = new Array(transactions.length);
  for (const { tx, index } of ordered) {
    if (tx.matched && tx.matched.confirmed) { results[index] = { tx, proposals: [], preselected: null }; continue; }
    const proposals = matchBankTx(tx, documents, contacts, { pending, taken });
    const best = proposals[0] && proposals[0].confidence >= PRESELECT_FROM ? proposals[0] : null;
    if (best) {
      best.allocations.forEach(a => {
        if (a.paymentId) taken.add(a.paymentId);
        else pending.set(a.docId, add(pending.get(a.docId) || '0', a.amount));
      });
    }
    results[index] = { tx, proposals, preselected: best };
  }
  return results;
}

export { PRESELECT_FROM, CONFIDENCE } from './rules.js';
export { directionOf, namesMatch, openAmount } from './candidates.js';
