// One movement: what it paid (with undo), or its proposals and a search to
// pick the document by hand. A hand-picked document gets the whole amount
// of the movement, as a partial payment or an overpayment if it differs.
import { h } from '../../../ui/dom.js';
import { openModal } from '../../../ui/modal.js';
import { t } from '../../../i18n/index.js';
import { showToast } from '../../../ui/toast.js';
import { autocomplete } from '../../../components/autocomplete.js';
import { matchBankTx, unapplyMatch, abs, round, sub, cmp } from '@we-invoice/core';
import { moneyState } from '../shared/data.js';
import { canWrite, guarded, patchDocuments } from '../shared/write.js';
import { money } from '../shared/format.js';
import { proposalLabel, proposalExplanation, txTitle } from './explain.js';
import { confirmProposal } from './match-dialog.js';
import { openDocuments, documentLabel } from '../payments/documents.js';

/** A proposal for a document the user picked. */
export function manualProposal(tx, doc, open) {
  const paid = round(abs(tx.amount), 2);
  const c = cmp(paid, open);
  return {
    docId: doc.id, docIds: [doc.id], confidence: 100, reason: 'MANUAL', reasons: ['MANUAL'],
    kind: c === 0 ? 'EXACT' : c < 0 ? 'PARTIAL' : 'OVERPAID', allocations: [{ docId: doc.id, amount: paid }], difference: round(sub(paid, open), 2)
  };
}

function matchedBody(tx, state, close) {
  const paid = state.documents.filter(d => (d.payments || []).some(p => p.bankTxId === tx.id));
  return h('div', {},
    h('h4', {}, t('bank.match.paidDocs')),
    h('ul', { class: 'plain-list' }, paid.map(d => h('li', {}, `${d.number || d.id}: ${money(d.payments.find(p => p.bankTxId === tx.id).amount, d.currency)}`))),
    h('button', {
      type: 'button', class: 'btn btn-danger', onclick: async () => {
        if (!canWrite(state)) return;
        close();
        const ok = await guarded(async (store) => {
          const result = unapplyMatch(store.get('bankTransactions', tx.id), store.list('documents'));
          await patchDocuments(store, result.documents);
          await store.update('bankTransactions', tx.id, result.tx);
          return true;
        });
        if (ok) showToast(t('bank.match.unmatched'), { type: 'success' });
      }
    }, t('bank.match.unmatch')));
}

function openBody(tx, state, close) {
  const docsById = new Map(state.documents.map(d => [d.id, d]));
  const apply = async (proposal) => {
    if (!canWrite(state)) return;
    close();
    const ok = await guarded(async (store) => { await confirmProposal(store, tx.id, proposal); return true; });
    if (ok) showToast(t('bank.match.applied', { n: 1 }), { type: 'success' });
  };
  const proposals = matchBankTx(tx, state.documents, state.contacts);
  const candidates = openDocuments(state, tx.amount.startsWith('-') ? 'OUT' : 'IN', tx.currency);
  const search = autocomplete({
    label: t('bank.match.manual'), placeholder: t('bank.match.search'),
    search: (q) => candidates.filter(c => documentLabel(c).toLowerCase().includes(q.toLowerCase())).slice(0, 20)
      .map(c => ({ id: c.doc.id, label: documentLabel(c), hint: money(c.open, c.doc.currency) })),
    onPick: (item) => {
      const c = candidates.find(x => x.doc.id === item.id);
      if (c) apply(manualProposal(tx, c.doc, c.open));
    }
  });
  return h('div', {},
    proposals.length
      ? h('ul', { class: 'match-list' }, proposals.map(p => h('li', { class: 'match-row' },
        h('div', { class: 'match-head' }, h('strong', {}, proposalLabel(p, docsById))),
        h('p', { class: 'match-why' }, proposalExplanation(p, tx.currency)),
        h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: () => apply(p) }, t('common.ok')))))
      : h('p', { class: 'muted' }, t('bank.match.noProposal')),
    search.el);
}

export function openTxDialog(ctx, txId) {
  const state = moneyState();
  const tx = state.bankTransactions.find(x => x.id === txId);
  if (!tx) return;
  let modal = null;
  const close = () => modal && modal.close();
  const details = h('p', { class: 'muted' }, [tx.counterpartyName, tx.counterpartyIban, tx.vs && `${t('bank.col.vs')} ${tx.vs}`, tx.message].filter(Boolean).join(' / '));
  modal = openModal({
    title: txTitle(tx), wide: true,
    body: h('div', {}, details, tx.matched?.confirmed ? matchedBody(tx, state, close) : openBody(tx, state, close)),
    actions: [{ label: t('common.close'), onClick: (m) => m.close() }]
  });
}
