// Start-up of the bank module (WP-BANK): registers the Bank, Cash desk and
// Payments screens over the placeholders and listens for requests of other
// modules. The screens load on first use, so they cost nothing at start.
//   payment:record  { docId }              opens the payment dialog for a document
//   payment:ekasa   { docId, paymentId }   opens the eKasa helper of a payment
import '../style/money.css';
import { h } from '../ui/dom.js';

const SCREENS = {
  bank: () => import('../views/money/bank/view.js').then(m => m.renderBank),
  cash: () => import('../views/money/cash/view.js').then(m => m.renderCash),
  payments: () => import('../views/money/payments/view.js').then(m => m.renderPayments)
};

// A screen that loads its code first; a failed load is shown and logged.
export function lazyScreen(load, ctx) {
  return (root, route) => {
    const waiting = h('p', { class: 'muted', role: 'status' }, ctx.t('bank.loading'));
    root.append(waiting);
    return load()
      .then(render => { waiting.remove(); render(root, ctx, route); })
      .catch(e => { waiting.remove(); ctx.showError(e); });
  };
}

export async function boot(ctx) {
  Object.entries(SCREENS).forEach(([name, load]) => ctx.registerRoute(name, lazyScreen(load, ctx)));
  ctx.on('payment:record', (payload) => {
    import('../views/money/payments/record-dialog.js')
      .then(m => m.openRecordDialog(ctx, { docId: payload?.docId || null }))
      .catch(e => ctx.showError(e));
  });
  ctx.on('payment:ekasa', (payload) => {
    if (!payload?.docId || !payload?.paymentId) return;
    import('../views/money/payments/ekasa-dialog.js')
      .then(m => m.openEkasaDialog(payload.docId, payload.paymentId))
      .catch(e => ctx.showError(e));
  });
}
