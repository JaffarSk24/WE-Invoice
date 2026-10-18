// Where this device keeps the data key (DEK) between launches, so the
// password is asked once, not on every start. Never the password, only
// the key. Ported from WE Budget.
//   browser   the CryptoKey itself goes to IndexedDB; it was imported
//             non-extractable, so page script cannot read its bytes
//   desktop   the raw bits go through transport.secrets (Electron
//             safeStorage: Keychain or DPAPI), base64 encoded
//   memory    tests, and a browser without IndexedDB: the key lives for
//             this session only and the password is asked again
// A keyring that cannot keep the key answers false from save(); the vault
// then reports keyStored: false, so the interface can warn.
import { importAesKey, toBase64, fromBase64 } from './crypto.js';

const DB = 'we-invoice-keys';
const STORE = 'keys';
const ID = 'dek';
const SECRET_NAME = 'dek';

export function memoryKeyring() {
  let saved = null;
  return {
    kind: 'memory',
    load: async () => saved,
    save: async (key) => { saved = key; return true; },
    forget: async () => { saved = null; }
  };
}

function openDb(indexedDb) {
  return new Promise((resolve, reject) => {
    const req = indexedDb.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(indexedDb, mode, fn) {
  const db = await openDb(indexedDb);
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function browserKeyring(indexedDb = globalThis.indexedDB) {
  return {
    kind: 'browser',
    async load() {
      try {
        const value = await run(indexedDb, 'readonly', s => s.get(ID));
        return value || null;
      } catch (e) {
        console.warn('The key store could not be read', e);
        return null;
      }
    },
    async save(key) {
      try {
        await run(indexedDb, 'readwrite', s => s.put(key, ID));
        return true;
      } catch (e) {
        console.warn('The key could not be kept in the browser', e);
        return false;
      }
    },
    async forget() {
      try { await run(indexedDb, 'readwrite', s => s.delete(ID)); } catch (e) { /* nothing stored */ }
    }
  };
}

// transport.secrets of the desktop: get(name) -> string|null, set(name, value), delete(name).
export function secretsKeyring(secrets) {
  return {
    kind: 'secrets',
    async load() {
      try {
        const value = await secrets.get(SECRET_NAME);
        return value ? importAesKey(fromBase64(value), false) : null;
      } catch (e) {
        console.warn('The key could not be read from the system keychain', e);
        return null;
      }
    },
    async save(key, bits) {
      if (!bits) return false;
      try {
        await secrets.set(SECRET_NAME, toBase64(bits));
        return true;
      } catch (e) {
        console.warn('The key could not be kept in the system keychain', e);
        return false;
      }
    },
    async forget() {
      try { await secrets.delete(SECRET_NAME); } catch (e) { /* nothing stored */ }
    }
  };
}

// The keyring for where the app runs. The desktop keeps the key in the
// system keychain only when its secrets bridge is there (WP-DESKTOP).
export function deviceKeyring(transport, win = typeof window !== 'undefined' ? window : null) {
  if (transport && transport.platform !== 'web' && win && win.weSecrets) return secretsKeyring(transport.secrets);
  if (globalThis.indexedDB) return browserKeyring();
  const memory = memoryKeyring();
  return { ...memory, save: async (key) => { await memory.save(key); return false; } };
}
