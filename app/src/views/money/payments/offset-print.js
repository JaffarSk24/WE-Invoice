// The printed dohoda o započítaní: both parties, the claims of each side
// that are offset, the amount and the date, and room for signatures.
import { t } from '../../../i18n/index.js';
import { moneyState } from '../shared/data.js';
import { money, day } from '../shared/format.js';
import { printDocument } from '../shared/print.js';

function claimRows(allocations, docsById, currency) {
  return allocations.map(a => {
    const doc = docsById.get(a.docId);
    return [doc?.number || a.docId, doc?.dueDate ? day(doc.dueDate) : '', money(a.amount, currency)];
  });
}

export function printOffset(protocolId) {
  const state = moneyState();
  const protocol = state.documents.find(d => d.id === protocolId);
  if (!protocol?.offset) return;
  const docsById = new Map(state.documents.map(d => [d.id, d]));
  const head = [t('offset.col.number'), t('offset.col.due'), t('offset.col.amount')];
  const company = state.company;
  printDocument({
    title: t('offset.protocol.title', { number: protocol.number }),
    blocks: [
      { text: [`${t('offset.protocol.partyA')}: ${[company.name, company.ico].filter(Boolean).join(', ')}`, `${t('offset.protocol.partyB')}: ${protocol.buyer?.name || ''}`, t('offset.protocol.intro')] },
      { heading: t('offset.protocol.ourClaims'), table: { head, rows: claimRows(protocol.offset.receivables, docsById, protocol.currency), num: [2] } },
      { heading: t('offset.protocol.theirClaims'), table: { head, rows: claimRows(protocol.offset.payables, docsById, protocol.currency), num: [2] } },
      { text: [t('offset.protocol.result', { amount: money(protocol.offset.amount, protocol.currency), date: day(protocol.issueDate) })] }
    ],
    signatures: t('offset.protocol.signatures')
  });
}
