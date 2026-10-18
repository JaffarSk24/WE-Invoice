// Start-up of contacts, items, recurring invoices, reminders and e-mail
// (WP-CRM): registers their routes and settings sections over the
// placeholders and starts their services. The screens load on first visit
// (import()), so they do not weigh on the first page load.
//
// Events this package listens to:
//   document:send { documentId, purpose?, penalties? }  opens the e-mail window
import { registerSettingsSection } from '../views/settings/registry.js';

export function lazyRoute(load, ctx) {
  return (root, route) => {
    load()
      .then(render => render(root, route))
      .catch(e => ctx.showError(e));
  };
}

// A settings section drawn by a module loaded on first use.
export function lazySection(load, ctx) {
  return (container, options) => {
    load()
      .then(render => render(container, options))
      .catch(e => ctx.showError(e));
  };
}

export async function boot(ctx) {
  const { transport } = ctx;
  ctx.registerRoute('contacts', lazyRoute(() => import('../views/contacts/index.js').then(m => m.createContactsView({ transport })), ctx));
  ctx.registerRoute('items', lazyRoute(() => import('../views/items/index.js').then(m => m.createItemsView({ transport })), ctx));
  registerSettingsSection('email', lazySection(() => import('../views/settings/email-section.js').then(m => m.emailSection), ctx));
  ctx.on('document:send', (payload) => {
    if (!payload || !payload.documentId) return;
    import('../mail/index.js')
      .then(m => m.openDocumentMail(payload, { transport }))
      .catch(e => ctx.showError(e, 'errors.MAIL_FAILED'));
  });
}
