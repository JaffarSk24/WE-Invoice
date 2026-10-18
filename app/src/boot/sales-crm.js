// Start-up of contacts, items, recurring invoices, reminders and e-mail
// (WP-CRM): registers their routes over the placeholders and starts their
// services. The screens load on first visit (import()), so they do not
// weigh on the first page load.
export function lazyRoute(load, ctx) {
  return (root, route) => {
    load()
      .then(render => render(root, route))
      .catch(e => ctx.showError(e));
  };
}

export async function boot(ctx) {
  const { transport } = ctx;
  ctx.registerRoute('contacts', lazyRoute(() => import('../views/contacts/index.js').then(m => m.createContactsView({ transport })), ctx));
  ctx.registerRoute('items', lazyRoute(() => import('../views/items/index.js').then(m => m.createItemsView({ transport })), ctx));
}
