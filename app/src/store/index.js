// The one store of the running app, created at boot (boot/sync.js) and
// shared by every module through getStore(). Tests build their own Store
// over a memory adapter.
import { Store } from './store.js';
import { deviceAdapter, memoryAdapter, indexedDbAdapter, KEYS } from './local.js';
import { emit } from '../events.js';

let instance = null;

export function createStore({ adapter = deviceAdapter(), emitter = emit } = {}) {
  instance = new Store({ adapter, emit: emitter });
  return instance;
}

export function getStore() {
  if (!instance) throw new Error('The store is not created yet');
  return instance;
}

export function hasStore() {
  return Boolean(instance);
}

export { Store, memoryAdapter, indexedDbAdapter, deviceAdapter, KEYS };
export { StoreError, CODES } from './errors.js';
export { nowIso, newRecord, touch, tombstone, live, isLive } from './records.js';
