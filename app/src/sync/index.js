// What the other modules may use of the sync package: the running engine,
// the store (store/index.js) and the dialogs. Created by boot/sync.js.
export { getStore, hasStore } from '../store/index.js';
export { SYNC_STATUSES } from './engine.js';
export { openSignInModal } from './ui/signin.js';
export { openSetupModal } from './ui/setup.js';
export { openUnlockModal, openRecoverModal } from './ui/unlock.js';
export { openChangePasswordModal } from './ui/change-password.js';
export { forgetKey, verifyPassword } from './account.js';

let engine = null;

export function setEngine(instance) {
  engine = instance;
}

export function getEngine() {
  if (!engine) throw new Error('The sync engine is not started yet');
  return engine;
}

export function hasEngine() {
  return Boolean(engine);
}
