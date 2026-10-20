// The original files of the Inbox (PDF, photo, XML) and the attachments of
// sales documents, kept on this device in IndexedDB next to the positioned
// text of their pages, so the preview and "Vybrať" work again without
// another OCR run. The data file in Drive holds the document and the
// file's id, name and size (attachments); the files themselves go to
// Drive through the sync package, which registers itself here
// (setRemoteFiles): a file this device lacks is then taken from Drive
// when it is read, and kept here as a cache.
const DB_NAME = 'we-invoice-inbox';
const STORE = 'files';
const memory = new Map();
let remoteFiles = null;

function idb() {
  return typeof indexedDB === 'undefined' ? null : indexedDB;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = idb().open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await openDb();
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

// The device store alone, without Drive: what the sync package reads,
// uploads and fills.
export const localFiles = Object.freeze({
  async get(id) {
    if (!idb()) return memory.get(id) || null;
    return (await run('readonly', s => s.get(id))) || null;
  },
  async put(id, file) {
    if (!idb()) { memory.set(id, file); return; }
    await run('readwrite', s => s.put(file, id));
  },
  async delete(id) {
    if (!idb()) { memory.delete(id); return; }
    await run('readwrite', s => s.delete(id));
  },
  async keys() {
    if (!idb()) return Array.from(memory.keys());
    return (await run('readonly', s => s.getAllKeys())).map(String);
  }
});

/**
 * Where files missing on this device come from: { fetch(id) -> file|null,
 * added(id), removed(id) }, or null. Set by the sync package at start.
 */
export function setRemoteFiles(provider) {
  remoteFiles = provider || null;
}

function tell(event, id) {
  if (!remoteFiles || typeof remoteFiles[event] !== 'function') return;
  try { remoteFiles[event](id); } catch (e) { console.warn(`File store listener ${event} failed`, e); }
}

/** Keeps a file: { name, type, bytes, pages }. */
export async function putFile(id, file) {
  await localFiles.put(id, file);
  tell('added', id);
}

/** The file, from this device or else from Drive; null when neither has it. */
export async function getFile(id) {
  const file = await localFiles.get(id);
  if (file || !remoteFiles) return file;
  try {
    return (await remoteFiles.fetch(id)) || null;
  } catch (e) {
    console.error(`File ${id} could not be taken from Drive`, e);
    return null;
  }
}

/** Drops the copy on this device; the sync removes the file from Drive once no document lists it. */
export async function deleteFile(id) {
  await localFiles.delete(id);
  tell('removed', id);
}
