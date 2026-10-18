// The data file of the desktop app: userData/we-invoice-data.json, written
// atomically, with a daily local backup kept before the first overwrite of
// the day and copies that are never rotated away. The page reaches it
// through the weStorage bridge (load, save, keepCopy, backupsFolder).
//
// A corrupt or unreadable file is never overwritten with an empty one: the
// load reports the problem, a save of an invalid document is refused, and
// the unreadable file is kept as a "corrupt" copy next to the backups.
const fs = require('fs');
const path = require('path');
const {
  DATA_FILE, DAILY_BACKUPS_TO_KEEP, KEPT_TAGS,
  dailyBackupName, taggedBackupName, dailyBackupsToDelete
} = require('./backups.cjs');
const { parseDocument, looksLikeFullReplace } = require('./data-check.cjs');

// Everything the storage does, bound to one userData folder. Pure Node, so
// tests run it on a temporary folder.
function createStorage(userData, { keep = DAILY_BACKUPS_TO_KEEP, now = () => new Date() } = {}) {
  const dataFile = path.join(userData, DATA_FILE);
  const backupsDir = path.join(userData, 'backups');

  function readRaw() {
    try {
      return fs.readFileSync(dataFile, 'utf8');
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  }

  // Keeps a copy of the current file under a tag; returns its path.
  function copyCurrent(tag) {
    if (!fs.existsSync(dataFile)) return null;
    fs.mkdirSync(backupsDir, { recursive: true });
    const dest = path.join(backupsDir, taggedBackupName(tag, now()));
    fs.copyFileSync(dataFile, dest);
    return dest;
  }

  // Once a day, before the first overwrite, keeps a copy of the current
  // file and rotates the oldest daily copies away.
  function makeDailyBackup() {
    if (!fs.existsSync(dataFile)) return;
    fs.mkdirSync(backupsDir, { recursive: true });
    const dest = path.join(backupsDir, dailyBackupName(now()));
    if (!fs.existsSync(dest)) fs.copyFileSync(dataFile, dest);
    dailyBackupsToDelete(fs.readdirSync(backupsDir), keep).forEach(name => fs.unlinkSync(path.join(backupsDir, name)));
  }

  // Atomic write: a temp file first, then rename over the real one, so a
  // crash in the middle leaves the old file intact.
  function writeAtomic(json) {
    fs.mkdirSync(userData, { recursive: true });
    const tmp = `${dataFile}.tmp`;
    fs.writeFileSync(tmp, json, 'utf8');
    fs.renameSync(tmp, dataFile);
  }

  return {
    dataFile,
    backupsDir,

    // { json } with the file's text, { json: null } when there is no file
    // yet, { json: null, error } when it cannot be read or is not a
    // document; the bad file is kept as a copy for the user to look at.
    load() {
      try {
        const json = readRaw();
        if (json === null) return { json: null };
        if (!parseDocument(json)) {
          const kept = copyCurrent('corrupt');
          console.error('[storage] the data file is not a valid document; copy kept at', kept);
          return { json: null, error: 'CORRUPT', kept };
        }
        return { json };
      } catch (e) {
        console.error('[storage] cannot read the data file', e);
        return { json: null, error: 'UNREADABLE' };
      }
    },

    // Refuses anything that is not a JSON object. When most records are
    // about to disappear at once, the old file is kept under its own name.
    save(json) {
      if (!parseDocument(json)) {
        console.error('[storage] refused to save: not a document');
        return { ok: false, error: 'INVALID_DOCUMENT' };
      }
      try {
        let prev = null;
        try { prev = readRaw(); } catch (e) { /* unreadable: still save the new document */ }
        if (prev && looksLikeFullReplace(prev, json)) copyCurrent('before-replace');
        try { makeDailyBackup(); } catch (e) { console.error('[storage] daily backup failed', e); }
        writeAtomic(json);
        return { ok: true };
      } catch (e) {
        console.error('[storage] cannot save the data file', e);
        return { ok: false, error: 'WRITE_FAILED' };
      }
    },

    // Both originals of a sync merge, kept as they were.
    keepCopy(tag, json) {
      if (!KEPT_TAGS.includes(tag) || !parseDocument(json)) return { ok: false, error: 'INVALID_COPY' };
      try {
        fs.mkdirSync(backupsDir, { recursive: true });
        fs.writeFileSync(path.join(backupsDir, taggedBackupName(tag, now())), json, 'utf8');
        return { ok: true };
      } catch (e) {
        console.error('[storage] cannot keep a copy', e);
        return { ok: false, error: 'WRITE_FAILED' };
      }
    },

    ensureBackupsDir() {
      fs.mkdirSync(backupsDir, { recursive: true });
      return backupsDir;
    }
  };
}

function initStorageIpc(ipcMain, shell, storage) {
  // Synchronous read at start-up: the store initialises before the first render.
  ipcMain.on('storage:load', (event) => { event.returnValue = storage.load(); });
  ipcMain.on('storage:save', (_event, json) => { storage.save(json); });
  ipcMain.on('storage:keep-copy', (_event, tag, json) => { storage.keepCopy(tag, json); });
  ipcMain.handle('storage:open-backups', async () => {
    const dir = storage.ensureBackupsDir();
    await shell.openPath(dir);
    return dir;
  });
}

module.exports = { createStorage, initStorageIpc };
