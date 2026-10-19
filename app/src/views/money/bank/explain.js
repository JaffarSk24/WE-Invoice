// Proposal texts shared by the matching dialogs: which documents, how sure,
// what kind of payment and why, all from the dictionaries.
import { t } from '../../../i18n/index.js';
import { money, day } from '../shared/format.js';

export function proposalDocs(proposal, docsById) {
  return proposal.docIds.map(id => docsById.get(id)?.number || id).join(', ');
}

export function proposalLabel(proposal, docsById) {
  return `${proposalDocs(proposal, docsById)} (${t('bank.match.confidence', { n: proposal.confidence })})`;
}

export function proposalExplanation(proposal, currency) {
  const diff = money(String(proposal.difference || '0').replace('-', ''), currency);
  const reasons = proposal.reasons.map(r => t(`bank.match.reason.${r}`)).join(', ');
  return `${t(`bank.match.kind.${proposal.kind}`, { diff })}: ${reasons}`;
}

export function txTitle(tx) {
  return t('bank.match.txTitle', { amount: money(tx.amount, tx.currency), date: day(tx.date) });
}
