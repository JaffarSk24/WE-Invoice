// Where the e-invoice screens read from: the store of the open company, or
// the sample data in demo mode (read only).
import { hasStore, getStore } from '../../store/index.js';
import { isDemo, demoData } from '../shell/demo-mode.js';
import { currentCompany } from '../shell/company-state.js';

export function efakturyData() {
  if (isDemo()) {
    const demo = demoData();
    return { demo: true, company: demo.company, documents: demo.documents || [], contacts: demo.contacts || [] };
  }
  const store = hasStore() ? getStore() : null;
  const company = store?.company() || currentCompany();
  if (!store || !store.company()) return { demo: false, company, documents: [], contacts: [] };
  return { demo: false, company, documents: store.list('documents'), contacts: store.list('contacts') };
}
