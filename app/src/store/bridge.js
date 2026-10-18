// Ties the store to the wizard and the shell. The store owns the companies
// (and syncs them to Google Drive); the shell only shows what
// "company:switched" carries. The jobs:
//   - the company the wizard made goes into the store (onboarding:complete);
//   - a company kept only on the device by an older version (before the
//     store held companies) moves into the store once at start;
//   - the device copy is dropped only after the store has written the
//     company, so nothing is lost when the store cannot write;
//   - the shell's wish to switch (company:switch) reaches the store, and a
//     changed company record is announced again to the shell.
// Sample mode shows the demo company and leaves the store alone.
import { loadLocalCompany, clearLocalCompany } from '../views/onboarding/state.js';
import { isDemo } from '../views/shell/demo-mode.js';

async function takeCompany(store, company, clear) {
  if (!company || !company.id || store.readOnly) return null;
  if (store.companies().some(c => c.id === company.id)) {
    clear();
    return null;
  }
  const created = await store.createCompany(company);
  clear();
  return created;
}

// At start: the device copy of a finished wizard, if the store lacks it.
export function adoptLocalCompany(store, { local = loadLocalCompany(), clear = clearLocalCompany } = {}) {
  return takeCompany(store, local, clear);
}

export function connectStore(store, { on, emit, showError, clear = clearLocalCompany }) {
  const fail = (message) => (e) => {
    console.error(message, e);
    showError(e);
  };
  on('onboarding:complete', (payload) => {
    takeCompany(store, payload && payload.company, clear).catch(fail('The company could not be saved to the store'));
  });
  on('company:switch', (payload) => {
    if (isDemo() || !payload || !payload.id) return;
    store.switchCompany(payload.id).catch(fail('The company could not be opened'));
  });
  on('data:changed', (payload) => {
    if (payload && payload.collection === 'company' && !isDemo()) emit('company:switched', store.switchedPayload());
  });
  on('demo:disabled', () => {
    if (store.company()) emit('company:switched', store.switchedPayload());
  });
}
