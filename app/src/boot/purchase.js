// Start-up of the purchase module (WP-PURCHASE): registers its routes over the
// placeholders and starts its services. Called once, in the order of
// boot/index.js, after the language and the transport are ready. The
// screens and the recognition code load on the first visit, so they do not
// weigh on the initial bundle.
import '../style/purchase.css';

let screens = null;

function loadScreens() {
  if (!screens) screens = import('../views/purchase/index.js').catch(e => { screens = null; throw e; });
  return screens;
}

function lazyRoute(ctx, make) {
  return (root, route) => loadScreens()
    .then(mod => { if (root.isConnected) make(mod)(root, route); })
    .catch(e => ctx.showError(e));
}

export async function boot(ctx) {
  ctx.registerRoute('inbox', lazyRoute(ctx, m => m.inboxRoute(ctx)));
  ctx.registerRoute('received', lazyRoute(ctx, m => m.listRoute('received', ctx)));
  ctx.registerRoute('expenses', lazyRoute(ctx, m => m.listRoute('expenses', ctx)));
}
