// Local persistence of the store: a small key/value file cabinet. Every
// value is one JSON text (the workspace, one company's data, the sync state
// of this device), stored under a key, so the browser and the desktop can
// offer the same interface:
//
//   adapter.kind            'memory' | 'indexeddb' | 'desktop'
//   adapter.get(key)        Promise<string|null>   the stored text
//   adapter.put(key, text)  Promise<void>
//   adapter.delete(key)     Promise<void>
//   adapter.keys()          Promise<string[]>
//
// The browser keeps the texts in IndexedDB, which is bigger and more
// durable than localStorage and survives the one-hour Google token. The
// desktop app (WP-DESKTOP) will hand the same calls to a bridge that
// writes files in userData; until then it uses IndexedDB too.

export const KEYS = Object.freeze({
  workspace: 'workspace',
  syncState: 'sync-state',
  secrets: 'secrets',
  company: (id) => `company:${id}`
});

export function memoryAdapter(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    kind: 'memory',
    get: async (key) => (map.has(key) ? map.get(key) : null),
    put: async (key, text) => { map.set(key, String(text)); },
    delete: async (key) => { map.delete(key); },
    keys: async () => Array.from(map.keys()),
    // For tests: the raw map.
    peek: (key) => (map.has(key) ? map.get(key) : null)
  };
}

const DB_NAME = 'we-invoice';
const STORE = 'files';

function openDb(indexedDb) {
  return new Promise((resolve, reject) => {
    const req = indexedDb.open(DB_NAME, 1);
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
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function indexedDbAdapter(indexedDb = globalThis.indexedDB) {
  if (!indexedDb) throw new Error('IndexedDB is not available');
  return {
    kind: 'indexeddb',
    get: async (key) => {
      const value = await run(indexedDb, 'readonly', s => s.get(key));
      return value === undefined ? null : String(value);
    },
    put: (key, text) => run(indexedDb, 'readwrite', s => s.put(String(text), key)),
    delete: (key) => run(indexedDb, 'readwrite', s => s.delete(key)),
    keys: async () => (await run(indexedDb, 'readonly', s => s.getAllKeys())).map(String)
  };
}

// The adapter for where the app runs. A desktop bridge (window.weStore with
// the same four calls) wins; a browser without IndexedDB (private mode in
// some browsers) keeps the data for the session only.
export function deviceAdapter(win = typeof window !== 'undefined' ? window : null) {
  const bridge = win && win.weStore;
  if (bridge && typeof bridge.get === 'function') return { kind: 'desktop', ...bridge };
  if (globalThis.indexedDB) return indexedDbAdapter();
  console.warn('No persistent storage: data lives for this session only');
  return memoryAdapter();
}
