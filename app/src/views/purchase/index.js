// The purchase screens (WP-PURCHASE): Inbox, received invoices and
// expenses. Each route shows its list, or one document when the hash
// carries an id ("#/received/<id>", "#/expenses/new").
import { renderInbox } from './inbox-view.js';
import { renderList } from './list-view.js';
import { renderReview } from './review-view.js';
import { routeParts } from './routes.js';
import { RECEIVED_KINDS, EXPENSE_KINDS } from './data.js';

export const LISTS = Object.freeze({
  received: { route: 'received', kinds: RECEIVED_KINDS, titleKey: 'nav.received', newKind: 'RECEIVED_INVOICE', emptyKey: 'purchase.received.empty' },
  expenses: { route: 'expenses', kinds: EXPENSE_KINDS, titleKey: 'nav.expenses', newKind: 'EXPENSE_RECEIPT', emptyKey: 'purchase.expenses.empty', summary: true }
});

export function inboxRoute(ctx) {
  return (root) => {
    const { id } = routeParts();
    if (id) renderReview(root, { id, route: 'inbox', ctx });
    else renderInbox(root, ctx);
  };
}

export function listRoute(name, ctx) {
  const spec = LISTS[name];
  return (root) => {
    const { id } = routeParts();
    if (id) renderReview(root, { id, route: spec.route, ctx, newKind: spec.newKind });
    else renderList(root, spec);
  };
}
