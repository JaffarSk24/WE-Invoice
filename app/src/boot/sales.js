// Start-up of the sales screens, built by two work packages at once: the
// document lists and editor (WP-SALES, sales-documents.js) and contacts,
// items, recurring invoices, reminders and e-mail (WP-CRM, sales-crm.js).
// Called once, in the order of boot/index.js, after the language and the
// transport are ready.
import { boot as bootDocuments } from './sales-documents.js';
import { boot as bootCrm } from './sales-crm.js';

export async function boot(ctx) {
  await bootDocuments(ctx);
  await bootCrm(ctx);
}
