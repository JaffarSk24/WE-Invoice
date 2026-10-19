// One payment for several documents: the message names them (several VS
// or numbers), or one party pays a few of its open documents at once and
// the amount is their sum. The money goes to the documents oldest due
// first; whatever is left over stays on the last one as an overpayment.
import { add, sub, cmp, round, abs, sum } from '../../../money/index.js';
import { docVs, partyIban, partyOf, namesMatch, searchText, digitRuns } from './candidates.js';

export const MULTI_CONFIDENCE = Object.freeze({ REFS_SUM: 90, IBAN_SUM: 80, REFS: 75, NAME_SUM: 60 });

const MAX_GROUP = 4;
const MAX_SEARCH = 12;

const byDue = (a, b) => String(a.doc.dueDate || a.doc.issueDate || '').localeCompare(String(b.doc.dueDate || b.doc.issueDate || ''))
  || String(a.doc.number || '').localeCompare(String(b.doc.number || ''));

/** Splits an amount over candidates in order. @returns {Array<{docId: string, amount: string}>} */
export function allocate(amount, candidates) {
  let left = round(amount, 2);
  const out = [];
  candidates.forEach((c, i) => {
    if (cmp(left, '0') <= 0) return;
    const last = i === candidates.length - 1;
    const part = last || cmp(left, c.open) < 0 ? left : c.open;
    out.push({ docId: c.doc.id, amount: round(part, 2) });
    left = round(sub(left, part), 2);
  });
  return out;
}

function proposal(reason, reasons, paid, group) {
  const open = sum(group.map(c => c.open));
  const allocations = allocate(paid, group);
  const c = cmp(paid, open);
  return {
    docId: allocations[0].docId,
    docIds: allocations.map(a => a.docId),
    confidence: MULTI_CONFIDENCE[reason],
    reason,
    reasons,
    kind: c === 0 ? 'MULTI' : c < 0 ? 'MULTI_PARTIAL' : 'MULTI_OVERPAID',
    allocations,
    difference: round(sub(paid, open), 2)
  };
}

function referenced(tx, candidates) {
  const text = searchText(tx);
  const runs = digitRuns(tx);
  return candidates.filter(c => {
    const vs = docVs(c.doc);
    const number = String(c.doc.number || '').toUpperCase().replace(/[\s-]/g, '');
    return (vs && (vs === tx.vs || (vs.length >= 4 && runs.has(vs)))) || (number.length >= 4 && text.includes(number));
  });
}

// The first group of 2 to 4 documents (oldest first) whose open amounts add up to `paid`.
function subsetSum(paid, list) {
  const items = list.slice(0, MAX_SEARCH);
  const pick = [];
  const walk = (start, total) => {
    if (pick.length >= 2 && cmp(total, paid) === 0) return pick.slice();
    if (pick.length === MAX_GROUP || cmp(total, paid) > 0) return null;
    for (let i = start; i < items.length; i++) {
      pick.push(items[i]);
      const found = walk(i + 1, add(total, items[i].open));
      if (found) return found;
      pick.pop();
    }
    return null;
  };
  return walk(0, '0');
}

/** Proposals that pay several documents with one transaction. */
export function multiProposals(tx, candidates) {
  const paid = round(abs(tx.amount), 2);
  const out = [];
  const refs = referenced(tx, candidates).sort(byDue);
  if (refs.length >= 2) {
    const exact = cmp(sum(refs.map(c => c.open)), paid) === 0;
    out.push(proposal(exact ? 'REFS_SUM' : 'REFS', exact ? ['REFS', 'AMOUNT_SUM'] : ['REFS'], paid, refs));
  }
  const ibanGroup = candidates.filter(c => tx.counterpartyIban && partyIban(c) === tx.counterpartyIban).sort(byDue);
  const nameGroup = candidates.filter(c => tx.counterpartyName && [c.contact?.name, partyOf(c.doc)?.name].some(n => n && namesMatch(n, tx.counterpartyName))).sort(byDue);
  const ibanSet = ibanGroup.length >= 2 ? subsetSum(paid, ibanGroup) : null;
  if (ibanSet) out.push(proposal('IBAN_SUM', ['IBAN', 'AMOUNT_SUM'], paid, ibanSet));
  else {
    const nameSet = nameGroup.length >= 2 ? subsetSum(paid, nameGroup) : null;
    if (nameSet) out.push(proposal('NAME_SUM', ['NAME', 'AMOUNT_SUM'], paid, nameSet));
  }
  return out;
}
