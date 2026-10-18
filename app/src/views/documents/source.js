// Where the sales screens read their data: the demo set in demo mode,
// otherwise the store of the open company. Writing is allowed only with a
// real company open and a writable store; the guard tells the user why
// not (demo mode, no company, read-only data) instead of failing silently.
import { hasStore, getStore } from '../../store/index.js';
import { isDemo, demoData } from '../shell/demo-mode.js';
import { currentCompany } from '../shell/company-state.js';
import { t } from '../../i18n/index.js';
import { showToast } from '../../ui/toast.js';
import { isPending } from './pending.js';

function openStore() {
  if (!hasStore()) return null;
  const store = getStore();
  return store.company() ? store : null;
}

export function salesStore() {
  return isDemo() ? null : openStore();
}

export function companyNow() {
  if (isDemo()) return demoData().company;
  const store = openStore();
  return (store && store.company()) || currentCompany();
}

export function allDocuments() {
  if (isDemo()) return demoData().documents;
  const store = openStore();
  return store ? store.list('documents').filter(d => !isPending(d.id)) : [];
}

export function allContacts() {
  if (isDemo()) return demoData().contacts;
  const store = openStore();
  return store ? store.list('contacts') : [];
}

export function allItems() {
  const store = salesStore();
  return store ? store.list('items') : [];
}

export function contactsById() {
  return new Map(allContacts().map(c => [c.id, c]));
}

export function findDocument(id) {
  return allDocuments().find(d => d.id === id) || null;
}

/** True when a change may be written; otherwise tells the user why not. */
export function guardWrite() {
  if (isDemo()) {
    showToast(t('documents.demo.readOnly'), { type: 'info' });
    return false;
  }
  const store = openStore();
  if (!store) {
    showToast(t('errors.NO_COMPANY'), { type: 'error' });
    return false;
  }
  if (store.readOnly) {
    showToast(t('errors.READ_ONLY'), { type: 'error' });
    return false;
  }
  return true;
}
