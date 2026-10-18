// Start-up of the tax module (WP-TAX): registers its routes over the
// placeholders and starts its services. Called once, in the order of
// boot/index.js, after the language and the transport are ready. The
// screens and their styles load on first use, so they stay out of the
// initial bundle.
export const TAX_ROUTE_NAMES = Object.freeze(['vat-records', 'kv', 'sv', 'vat-return']);

let loading = null;

export function loadTaxViews() {
  if (!loading) loading = import('../views/tax/index.js').catch(e => { loading = null; throw e; });
  return loading;
}

export async function boot(ctx) {
  TAX_ROUTE_NAMES.forEach(name => ctx.registerRoute(name, (root) => {
    loadTaxViews()
      .then(views => { if (root.isConnected) views.renderTaxRoute(name, ctx, root); })
      .catch(e => {
        console.error('The tax screens could not be loaded', e);
        ctx.showError(e);
      });
  }));
}
