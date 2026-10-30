// Confirming match proposals in one dialog (03-features.md § 3.9): one row
// per movement with its best proposals; confident ones are ticked, the
// rest wait for the user. Confirming writes the payments into the
// documents and marks the movements; nothing is written without it.
import { h } from '../../../ui/dom.js';
import { openModal } from '../../../ui/modal.js';
import { t } from '../../../i18n/index.js';
import { showToast } from '../../../ui/toast.js';
import { matchStatement, applyMatch } from '@we-invoice/core';
import { moneyState } from '../shared/data.js';
import { canWrite, guarded, patchDocuments } from '../shared/write.js';
import { proposalLabel, proposalExplanation, txTitle } from './explain.js';
import { bookCashTransfer } from './cash-transfer.js';

/** Stores one confirmed proposal: the payments on the documents (or a cash voucher), the mark on the movement. */
export async function confirmProposal(store, txId, proposal) {
  if (proposal.kind === 'CASH_TRANSFER') {
    const purpose = t(proposal.transfer === 'WITHDRAWAL' ? 'bank.transfer.purposeWithdrawal' : 'bank.transfer.purposeDeposit');
    await bookCashTransfer(store, txId, proposal, { bookName: t('cash.book.defaultName'), purpose });
    return;
  }
  const tx = store.get('bankTransactions', txId);
  const result = applyMatch(tx, proposal, store.list('documents'));
  await patchDocuments(store, result.documents);
  await store.update('bankTransactions', txId, result.tx);
}

function row(result, docsById) {
  const { tx, proposals, preselected } = result;
  const check = h('input', { type: 'checkbox', class: 'match-check', checked: Boolean(preselected), 'aria-label': txTitle(tx) });
  const explanation = h('p', { class: 'match-why' });
  const select = h('select', { 'aria-label': t('bank.match.title') }, proposals.map((p, i) => h('option', { value: String(i), selected: p === (preselected || proposals[0]) }, proposalLabel(p, docsById))));
  const update = () => { explanation.textContent = proposalExplanation(proposals[Number(select.value)], tx.currency); };
  select.addEventListener('change', () => { check.checked = true; update(); });
  update();
  const el = h('li', { class: 'match-row' },
    h('label', { class: 'match-head' }, check, h('span', {}, txTitle(tx)), h('span', { class: 'muted' }, [tx.counterpartyName, tx.vs && `${t('bank.col.vs')} ${tx.vs}`, tx.message].filter(Boolean).join(' / '))),
    select, explanation);
  return { el, txId: tx.id, chosen: () => (check.checked ? proposals[Number(select.value)] : null) };
}

export function openMatchDialog(ctx, txIds) {
  const state = moneyState();
  if (!canWrite(state)) return;
  const wanted = new Set(txIds);
  const txs = state.bankTransactions.filter(tx => wanted.has(tx.id) && !tx.matched?.confirmed);
  const results = matchStatement(txs, state.documents, state.contacts).filter(r => r.proposals.length);
  if (!results.length) { showToast(t('bank.match.none'), { type: 'info' }); return; }
  const docsById = new Map(state.documents.map(d => [d.id, d]));
  const rows = results.map(r => row(r, docsById));
  const count = () => rows.filter(r => r.chosen()).length;
  const modal = openModal({
    title: t('bank.match.title'), wide: true,
    body: h('ul', { class: 'match-list' }, rows.map(r => r.el)),
    actions: [
      { label: t('common.cancel'), onClick: (m) => m.close() },
      {
        label: t('bank.match.apply', { n: count() }), kind: 'primary', onClick: async (m) => {
          const chosen = rows.map(r => ({ txId: r.txId, proposal: r.chosen() })).filter(c => c.proposal);
          m.close();
          const done = await guarded(async (store) => {
            for (const c of chosen) await confirmProposal(store, c.txId, c.proposal);
            return chosen.length;
          });
          if (done !== null) showToast(t('bank.match.applied', { n: done }), { type: 'success' });
        }
      }
    ]
  });
  const apply = modal.footer.querySelector('[data-primary]');
  modal.content.addEventListener('change', () => { apply.textContent = t('bank.match.apply', { n: count() }); });
}
