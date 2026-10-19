// Saving the open company from the Settings forms: through the store when
// it holds that company, then the shell hears company:switched so the
// menu and the screens follow. Demo mode and read-only data refuse with a
// message instead of failing silently.
import { hasStore, getStore } from '../../store/index.js';
import { currentCompany, companyList } from '../shell/company-state.js';
import { isDemo } from '../shell/demo-mode.js';
import { emit } from '../../events.js';
import { t } from '../../i18n/index.js';
import { showToast } from '../../ui/toast.js';

/** The store holding the open company, or null. */
export function companyStore() {
  if (!hasStore()) return null;
  const store = getStore();
  const company = currentCompany();
  return store.company() && (!company || store.company().id === company.id) ? store : null;
}

/** Saves a patch of the open company; returns the new record or null when refused. */
export async function saveCompanyPatch(patch, { store = companyStore() } = {}) {
  if (isDemo()) { showToast(t('documents.demo.readOnly'), { type: 'info' }); return null; }
  if (!store) { showToast(t('errors.NO_COMPANY'), { type: 'error' }); return null; }
  if (store.readOnly) { showToast(t('errors.READ_ONLY'), { type: 'error' }); return null; }
  const next = await store.updateCompany(patch);
  emit('company:switched', { company: next, companies: companyList().map(c => (c.id === next.id ? next : c)) });
  return next;
}

/** The company record the forms show: the store's copy when it has one. */
export function companyForForms() {
  const store = companyStore();
  return (store && store.company()) || currentCompany();
}
