// Writes of the money screens go through here: nothing is written in demo
// mode or on read-only data (the user gets a toast instead), every failure
// reaches the user as a translated message and the console with its cause.
import { getStore } from '../../../store/index.js';
import { t } from '../../../i18n/index.js';
import { showToast, showError } from '../../../ui/toast.js';

/** False (after telling the user why) when the state cannot be written. */
export function canWrite(state) {
  if (state.demo) { showToast(t('bank.demo.readOnly'), { type: 'info' }); return false; }
  if (!state.ready) { showToast(t('bank.noCompany.title'), { type: 'info' }); return false; }
  if (state.readOnly) { showToast(t('bank.readOnly'), { type: 'error' }); return false; }
  return true;
}

/** Runs a write; a failure is shown and logged, the result is null. */
export async function guarded(work) {
  try {
    return await work(getStore());
  } catch (e) {
    showError(e);
    return null;
  }
}

/** Stores document patches [{id, patch}] one by one. */
export async function patchDocuments(store, patches) {
  for (const { id, patch } of patches) await store.update('documents', id, patch);
}
