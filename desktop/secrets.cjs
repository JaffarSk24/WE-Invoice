// weSecrets: small secrets of the desktop app (provider API keys, the SMTP
// password) sealed by the operating system's keychain through Electron's
// safeStorage and kept as files under userData/secrets/. When the keychain
// is not usable (some Linux desktops fall back to a fixed key), nothing is
// written and the page asks the user each session. Names may carry ":" as
// the page builds them ("peppol:<company>:<provider>"); the file name puts
// "~" in its place, because Windows does not allow ":" in a file name.
const fs = require('fs');
const path = require('path');

const NAME = /^[a-z][a-z0-9._:-]{0,127}$/i;
const MAX_VALUE = 64 * 1024;

function keychainUsable(safeStorage, platform = process.platform) {
  try {
    if (!safeStorage.isEncryptionAvailable()) return false;
    if (platform === 'linux' && typeof safeStorage.getSelectedStorageBackend === 'function') {
      return !['basic_text', 'unknown'].includes(safeStorage.getSelectedStorageBackend());
    }
    return true;
  } catch (e) {
    return false;
  }
}

function createSecrets({ safeStorage, dir, platform = process.platform }) {
  const fileOf = (name) => path.join(dir, `${name.replace(/:/g, '~')}.bin`);
  const valid = (name) => typeof name === 'string' && NAME.test(name);

  return {
    available: () => keychainUsable(safeStorage, platform),

    // { ok, value } with null when there is no such secret.
    get(name) {
      if (!valid(name)) return { ok: false, error: 'BAD_NAME' };
      try {
        if (!fs.existsSync(fileOf(name))) return { ok: true, value: null };
        return { ok: true, value: safeStorage.decryptString(fs.readFileSync(fileOf(name))) };
      } catch (e) {
        console.error('[secrets] cannot read', name, e.message);
        return { ok: false, error: 'UNREADABLE' };
      }
    },

    // { ok, stored } where stored is false when the keychain is not usable.
    set(name, value) {
      if (!valid(name)) return { ok: false, error: 'BAD_NAME' };
      if (typeof value !== 'string' || value.length > MAX_VALUE) return { ok: false, error: 'BAD_VALUE' };
      if (!keychainUsable(safeStorage, platform)) return { ok: true, stored: false };
      try {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        const tmp = `${fileOf(name)}.tmp`;
        fs.writeFileSync(tmp, safeStorage.encryptString(value), { mode: 0o600 });
        fs.renameSync(tmp, fileOf(name));
        return { ok: true, stored: true };
      } catch (e) {
        console.error('[secrets] cannot store', name, e.message);
        return { ok: false, error: 'WRITE_FAILED' };
      }
    },

    delete(name) {
      if (!valid(name)) return { ok: false, error: 'BAD_NAME' };
      try {
        fs.rmSync(fileOf(name), { force: true });
        return { ok: true };
      } catch (e) {
        console.error('[secrets] cannot delete', name, e.message);
        return { ok: false, error: 'WRITE_FAILED' };
      }
    }
  };
}

function initSecretsIpc(ipcMain, secrets) {
  ipcMain.handle('secrets:available', () => secrets.available());
  ipcMain.handle('secrets:get', (_e, name) => secrets.get(name));
  ipcMain.handle('secrets:set', (_e, name, value) => secrets.set(name, value));
  ipcMain.handle('secrets:delete', (_e, name) => secrets.delete(name));
}

module.exports = { createSecrets, initSecretsIpc, keychainUsable, NAME };
