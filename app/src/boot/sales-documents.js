// Start-up of the document lists and the document editor (WP-SALES):
// registers their routes over the placeholders and starts their services.
//
// Events this module listens to:
//   document:new { kind, contactId? }   opens the editor of a new document
//   fab:action { id: 'invoice' }, quick:invoice { contact }   the same for an invoice
//   hotkey:new / hotkey:save / hotkey:issue   on the sales screens
//   pricing:provider fn(item, { contact, date })   price levels (stock)
// Events it sends: document:send, peppol:send, stock:document-issued
// (see views/editor), pdf:download (boot/pdf.js).
import { registerSettingsSection } from '../views/settings/registry.js';
import { setDashboardSource } from '../views/dashboard/data.js';
import { SALES_ROUTES, isSalesKind, routeForKind, salesHash, LIST_ROUTES } from '../views/documents/kinds.js';
import { salesRoute } from '../views/documents/route-view.js';
import { dashboardSource } from '../views/documents/dashboard-source.js';
import { allContacts } from '../views/documents/source.js';
import { hasStore, getStore } from '../store/index.js';
import { fold } from '../views/documents/rows.js';
import { setPriceProvider } from '../views/editor/pricing.js';
import { documentsSettings } from '../views/settings/documents-section.js';
import { companySection } from '../views/settings/company-section.js';

export function openNew(kind, contactId = null) {
  const route = routeForKind(kind);
  if (!route) return false;
  window.location.hash = salesHash(route, { mode: 'new', params: { kind, contact: contactId } });
  return true;
}

function contactFromQuick(text) {
  if (!text) return null;
  const contacts = allContacts();
  const byId = contacts.find(c => c.id === text);
  if (byId) return byId.id;
  const q = fold(text);
  const byName = contacts.find(c => fold(c.name) === q) || contacts.find(c => c.ico && c.ico === text.replace(/\s/g, ''));
  return byName ? byName.id : null;
}

const hasOpenCompany = () => hasStore() && Boolean(getStore().company());

const click = (id) => { const el = typeof document !== 'undefined' ? document.getElementById(id) : null; if (el && !el.disabled) el.click(); };

export async function boot(ctx) {
  const render = salesRoute({ transport: ctx.transport });
  SALES_ROUTES.forEach(route => ctx.registerRoute(route, render));

  ctx.on('document:new', (payload) => { if (payload && isSalesKind(payload.kind)) openNew(payload.kind, payload.contactId || null); });
  ctx.on('fab:action', (payload) => { if (payload && payload.id === 'invoice') openNew('INVOICE'); });
  ctx.on('quick:invoice', (quick) => openNew('INVOICE', contactFromQuick(quick && quick.contact)));
  ctx.on('hotkey:new', ({ route } = {}) => { if (LIST_ROUTES[route]) openNew(LIST_ROUTES[route].newKinds[0]); });
  ctx.on('hotkey:save', ({ route } = {}) => { if (LIST_ROUTES[route]) click('editor-save'); });
  ctx.on('hotkey:issue', ({ route } = {}) => { if (LIST_ROUTES[route]) click('editor-issue'); });
  ctx.on('pricing:provider', setPriceProvider);

  registerSettingsSection('documents', documentsSettings);
  registerSettingsSection('company', companySection);
  // Registered only while a company is open, so the dashboard keeps its
  // own empty state (with the way to the wizard) until there is one.
  const syncDashboard = () => setDashboardSource(hasOpenCompany() ? dashboardSource : null);
  syncDashboard();
  ['company:switched', 'demo:enabled', 'demo:disabled'].forEach(ev => ctx.on(ev, syncDashboard));
  ctx.on('data:changed', (e) => { if (!e || e.collection === 'company') syncDashboard(); });
}
