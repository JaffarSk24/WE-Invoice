// Where the CRM screens (contacts, items, recurring invoices, reminders,
// e-mail) read and write: the store of the open company, or the sample
// data in demo mode, which is shown but never written. Every write goes
// through write(), which explains why nothing happens in demo mode or
// without a company, and shows a translated error instead of failing
// silently.
import { t } from '../../i18n/index.js';
import { on } from '../../events.js';
import { showToast, showError } from '../../ui/toast.js';
import { hasStore, getStore } from '../../store/index.js';
import { isDemo, demoData } from '../shell/demo-mode.js';
import { currentCompany } from '../shell/company-state.js';

export function openStore() {
  if (!hasStore()) return null;
  const store = getStore();
  return store.company() ? store : null;
}

export function listOf(collection) {
  if (isDemo()) return (demoData()[collection] || []).slice();
  const store = openStore();
  return store ? store.list(collection) : [];
}

export function getOf(collection, id) {
  if (isDemo()) return (demoData()[collection] || []).find(r => r.id === id) || null;
  const store = openStore();
  return store ? store.get(collection, id) : null;
}

export function companyOf() {
  if (isDemo()) return demoData().company;
  const store = openStore();
  return (store && store.company()) || currentCompany();
}

export function canWrite() {
  const store = openStore();
  return !isDemo() && Boolean(store) && !store.readOnly;
}

// Runs fn(store) when writing is possible. Resolves to fn's result, or
// null when the write was refused or failed (the user is told why).
export async function write(fn) {
  if (isDemo()) {
    showToast(t('crm.demo.readOnly'), { type: 'info' });
    return null;
  }
  const store = openStore();
  if (!store) {
    showToast(t('crm.noCompany'), { type: 'info' });
    return null;
  }
  if (store.readOnly) {
    showToast(t('errors.READ_ONLY'), { type: 'error' });
    return null;
  }
  try {
    return await fn(store);
  } catch (e) {
    showError(e);
    return null;
  }
}

// Redraws a view when its collections change or another company opens;
// stops listening once the view is gone from the page.
export function onData(root, collections, redraw) {
  const offs = [];
  const stop = () => offs.forEach(off => off());
  const handle = (payload) => {
    if (!root.isConnected) { stop(); return; }
    if (!payload || !payload.collection || collections.includes(payload.collection)) redraw();
  };
  offs.push(on('data:changed', handle), on('company:switched', () => handle(null)));
  return stop;
}

// The sub-path of the current route: "#/contacts/abc/edit" -> ['abc', 'edit'].
export function subPath() {
  const hash = typeof window !== 'undefined' ? window.location.hash : '';
  return String(hash).replace(/^#\/?/, '').split('?')[0].split('/').slice(1).filter(Boolean).map(decodeURIComponent);
}
