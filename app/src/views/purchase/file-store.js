// The original files of the Inbox (PDF, photo, XML) kept on this device in
// IndexedDB, next to the positioned text of their pages, so the preview
// and "Vybrať" work again without another OCR run. The data file in Drive
// holds the document and the file's id, name and size (attachments); the
// upload of attachments to Drive belongs to the sync package.
const DB_NAME = 'we-invoice-inbox';
const STORE = 'files';
const memory = new Map();

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

/** Keeps a file: { name, type, bytes, pages }. */
export async function putFile(id, file) {
  if (!idb()) { memory.set(id, file); return; }
  await run('readwrite', s => s.put(file, id));
}

export async function getFile(id) {
  if (!idb()) return memory.get(id) || null;
  return (await run('readonly', s => s.get(id))) || null;
}

export async function deleteFile(id) {
  if (!idb()) { memory.delete(id); return; }
  await run('readwrite', s => s.delete(id));
}
