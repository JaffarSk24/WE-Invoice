// The user-facing operations on the encryption of a workspace, over the
// engine: turning it on (first start), typing the password on a new
// device, recovery with the 24 words, a new password, forgetting the key
// on this device. Every one of them changes only the header (keys.js) and
// the key of this device; the files in Drive are never rewritten for it.
import { createKeys, unlockWithPassword, unlockWithRecovery, changePassword as rewrap, isEncrypted } from './keys.js';
import { confirmationPositions } from './recovery.js';
import { cryptoError } from './crypto.js';

// The header that counts: the cloud one when it is there (another device
// may have changed the password), else the local one.
async function currentHeader(engine) {
  if (engine.signedIn) {
    try {
      const cloud = await engine.remote.readWorkspace();
      if (cloud) return cloud.header;
    } catch (e) {
      if (e && e.code !== 'OFFLINE') throw e;
    }
  }
  const local = engine.store.workspace.keys;
  if (!local) throw cryptoError('DAMAGED', 'No encryption header anywhere');
  return local;
}

// Turning encryption on for a new workspace: the words are shown once and
// confirmed (see confirmSetup); nothing is uploaded before that.
export async function setupEncryption(engine, password, options = {}) {
  await engine.settle();
  if (isEncrypted(engine.store.workspace)) throw cryptoError('ALREADY_ENCRYPTED');
  const { header, dekBits, words } = await createKeys(password, { now: engine.now(), ...options });
  await engine.store.updateKeys(header);
  await engine.vault.unlock(dekBits);
  engine.setState({ encrypted: true, locked: false, keyStored: engine.vault.keyStored });
  return { words, confirm: confirmationPositions() };
}

// The user confirmed the recovery words: the workspace and the company
// data go to Drive now.
export async function confirmSetup(engine) {
  if (!engine.signedIn) return { ok: true, outcome: 'off' };
  return engine.sync('setup', { upload: true });
}

// The password of an encrypted workspace, on a device without the key.
export async function unlock(engine, password) {
  await engine.settle();
  const header = await currentHeader(engine);
  const dekBits = await unlockWithPassword(header, password);
  if (!engine.store.workspace.keys) await engine.store.updateKeys(header);
  await engine.vault.unlock(dekBits);
  engine.setState({ encrypted: true, locked: false, keyStored: engine.vault.keyStored, error: null });
  return engine.sync('unlock');
}

// The password is lost: the 24 words open the key and a new password is
// set at once. The new header goes to Drive on the next upload.
export async function recover(engine, words, newPassword) {
  await engine.settle();
  const header = await currentHeader(engine);
  const dekBits = await unlockWithRecovery(header, words);
  const next = await rewrap(header, dekBits, newPassword, { now: engine.now() });
  await engine.store.updateKeys(next);
  await engine.vault.unlock(dekBits);
  engine.setState({ encrypted: true, locked: false, keyStored: engine.vault.keyStored, error: null });
  return engine.sync('recover', { upload: true });
}

// A new password: only the header changes (and goes up at once).
export async function changePassword(engine, oldPassword, newPassword) {
  await engine.settle();
  const header = await currentHeader(engine);
  const dekBits = await unlockWithPassword(header, oldPassword);
  const next = await rewrap(header, dekBits, newPassword, { now: engine.now() });
  await engine.store.updateKeys(next);
  if (engine.vault.locked) await engine.vault.unlock(dekBits);
  return engine.sync('rekey', { upload: true });
}

export async function verifyPassword(engine, password) {
  try {
    await unlockWithPassword(await currentHeader(engine), password);
    return true;
  } catch (e) {
    if (e && e.code === 'WRONG_PASSWORD') return false;
    throw e;
  }
}

// This device asks for the password again; the files are untouched.
export async function forgetKey(engine) {
  await engine.settle();
  await engine.vault.lock();
  engine.setState({ locked: isEncrypted(engine.store.workspace), keyStored: true });
}
