// Writing many records at once (an import, a restore, marking a period
// exported). The store's CRUD methods save the whole file per record,
// which is slow for thousands; here the new data root is computed by the
// core and handed to the store in one step. The store announces it as a
// sync arrival (lists redraw); a second announcement as a local change
// makes the sync engine upload it like any other edit.
import { StoreError, CODES } from '../../store/index.js';

export async function replaceCompanyData(store, data) {
  if (!store || !store.data) throw new StoreError(CODES.NO_COMPANY, 'No company is open');
  if (store.readOnly) throw new StoreError(CODES.READ_ONLY, 'The data is open read-only');
  if (data.companyId !== store.data.companyId) throw new StoreError(CODES.NO_COMPANY, 'The data is for another company');
  await store.applySynced(data);
  store.emit('data:changed', { collection: null, id: null, source: 'local' });
  return store.data;
}
