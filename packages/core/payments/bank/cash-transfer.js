// Cash taken from the account at a cash machine, or paid into it, is no
// income or expense: the money moves between the bank account and the
// cash book (priebežná položka). Such a movement is matched with a cash
// voucher of the same amount (a receipt for a withdrawal, an expense
// voucher for a deposit) instead of a document.
import { normalizeText } from './text.js';
import { isNegative } from '../../money/index.js';

const WITHDRAWAL = /\b(vyber z bankomatu|vyber hotovosti|vyber v hotovosti|vyber z atm|vyber hotovosti z atm|cash withdrawal|atm withdrawal|bargeldauszahlung|bargeldabhebung)\b/;
const DEPOSIT = /\b(vklad hotovosti|vklad v hotovosti|vklad hotovosti cez bankomat|cash deposit|bareinzahlung)\b/;

/** 'WITHDRAWAL' (bank to cash), 'DEPOSIT' (cash to bank) or null. */
export function cashTransferOf(tx) {
  if (!tx || !tx.amount) return null;
  const text = normalizeText([tx.message, tx.counterpartyName].filter(Boolean).join(' '));
  if (isNegative(tx.amount) && WITHDRAWAL.test(text)) return 'WITHDRAWAL';
  if (!isNegative(tx.amount) && DEPOSIT.test(text)) return 'DEPOSIT';
  return null;
}

/** The proposal to book a withdrawal or a deposit as a transfer with the cash book, or null. */
export function cashTransferProposal(tx) {
  const transfer = cashTransferOf(tx);
  if (!transfer) return null;
  return {
    docId: null, docIds: [], confidence: 100, reason: 'CASH_TRANSFER', reasons: [transfer === 'WITHDRAWAL' ? 'CASH_WITHDRAWAL' : 'CASH_DEPOSIT'],
    kind: 'CASH_TRANSFER', transfer, allocations: [], difference: '0.00'
  };
}
