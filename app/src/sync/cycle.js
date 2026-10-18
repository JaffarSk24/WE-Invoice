// One sync of one root (the workspace or one company's data), ported from
// the WE Budget engine step. The rules that keep an old copy from ever
// overwriting newer work:
//   - whether the cloud changed is decided by content: the hash of the
//     cloud root against the hash this device saw at its last sync;
//   - a write looks at the cloud right before and never replaces a version
//     this device has not seen (then the caller runs the cycle again);
//   - when both copies changed, or this device has no record of the cloud
//     file, they are merged record by record and both originals are kept.
//
// spec = { path, local(), hasWork(data), read(), write(data), apply(data),
//          merge(local, remote), keep(tag, data), afterMerge(data) }
// saved = { version, remoteHash, localHash } from the device's sync state.
import { hashOf } from './hash.js';

// What a sync does, from what is known about both copies.
//   remoteExists   the cloud holds the root
//   known          this device remembers the cloud file and its content
//   remoteChanged  the cloud content differs from what this device last saw
//   localChanged   the local root differs from what it was at that sync
//   localWork      the local root holds anything at all
export function syncAction({ remoteExists, known, remoteChanged, localChanged, localWork }) {
  if (!remoteExists) return localWork ? 'push' : 'up_to_date';
  if (!known) return localWork ? 'merge' : 'pull';
  if (remoteChanged && localChanged) return 'merge';
  if (remoteChanged) return 'pull';
  if (localChanged) return 'push';
  return 'up_to_date';
}

// Writes `data` over the version this device just looked at. Right before
// writing, the cloud is asked again: if another device wrote in the
// meantime, nothing is written and null is returned (try again).
async function writeOver(remote, spec, seenVersion, data) {
  if (seenVersion) {
    const { entry } = await remote.stat(spec.path);
    if (!entry || entry.version !== seenVersion) return null;
  }
  const saved = await spec.write(data);
  const hash = hashOf(data);
  return { version: saved.version, remoteHash: hash, localHash: hashOf(spec.local()) };
}

// Returns { outcome, state } or null when a write found the cloud changed
// under it. `state` is the new saved entry for this root.
export async function syncRoot(remote, spec, saved = {}, { upload = false } = {}) {
  const localData = spec.local();
  const { entry, duplicates } = await remote.stat(spec.path);

  // A spare copy (two devices creating the file at the same moment) is
  // merged in before it goes: it can hold work the main one lacks.
  let localMerged = localData;
  let spareChanged = false;
  for (const dup of duplicates) {
    const spare = await spec.readAt(dup.path, dup);
    if (!spare) continue;
    spec.keep('cloud', spare.data);
    const m = spec.merge(localMerged || spare.data, spare.data);
    localMerged = m.data;
    spareChanged = spareChanged || m.localChanged || !localData;
  }
  if (spareChanged) {
    await spec.apply(spec.afterMerge ? spec.afterMerge(localMerged) : localMerged);
    saved = { ...saved, localHash: null };
  }
  const tidy = async () => {
    for (const dup of duplicates) {
      try { await remote.removeAt(dup.path); } catch (e) { /* tidy-up only */ }
    }
  };
  const local = spec.local();

  if (!entry) {
    if (!local || !spec.hasWork(local)) return { outcome: 'empty', state: saved };
    if (!upload) return { outcome: 'local-ahead', state: saved };
    const state = await writeOver(remote, spec, null, local);
    return state ? { outcome: 'pushed', state } : null;
  }

  const known = Boolean(saved.version && saved.remoteHash);
  let remoteData = null;
  let remoteHash = known ? saved.remoteHash : null;
  let version = entry.version;
  const read = async () => {
    const r = await spec.read();
    if (!r) throw Object.assign(new Error('The cloud file vanished while syncing'), { code: 'SYNC_FAILED' });
    remoteData = r.data;
    remoteHash = hashOf(remoteData);
    version = r.version || version;
  };
  if (!known || entry.version !== saved.version) await read();

  if (!local) {
    if (!remoteData) await read();
    await spec.apply(remoteData);
    await tidy();
    return { outcome: 'pulled', state: { version, remoteHash, localHash: hashOf(spec.local()) } };
  }
  const localHash = hashOf(local);
  if (remoteHash === localHash) {
    await tidy();
    return { outcome: 'unchanged', state: { version, remoteHash, localHash } };
  }

  const action = syncAction({
    remoteExists: true,
    known,
    remoteChanged: !known || remoteHash !== saved.remoteHash,
    localChanged: localHash !== saved.localHash,
    localWork: spec.hasWork(local)
  });

  if (action === 'up_to_date') return { outcome: 'unchanged', state: { ...saved, version } };

  if (action === 'push') {
    if (!upload) return { outcome: 'local-ahead', state: { ...saved, version } };
    const state = await writeOver(remote, spec, version, local);
    if (!state) return null;
    await tidy();
    return { outcome: 'pushed', state };
  }

  if (!remoteData) await read();

  if (action === 'pull') {
    await spec.apply(remoteData);
    await tidy();
    return { outcome: 'pulled', state: { version, remoteHash, localHash: hashOf(spec.local()) } };
  }

  // merge: both originals go to the backups first.
  spec.keep('local', local);
  spec.keep('cloud', remoteData);
  let { data, localChanged, remoteChanged } = spec.merge(local, remoteData);
  if (spec.afterMerge) {
    const fixed = spec.afterMerge(data);
    if (fixed !== data) { data = fixed; localChanged = true; remoteChanged = true; }
  }
  if (localChanged) await spec.apply(data);
  const merged = spec.local();
  // The cloud copy is now part of the local root. Whatever the cloud still
  // lacks goes up now when uploading is allowed, otherwise on closing, on
  // the idle timer or from the Sync button.
  let state = { version, remoteHash, localHash: remoteChanged ? null : hashOf(merged) };
  if (remoteChanged && upload) {
    state = await writeOver(remote, spec, version, merged);
    if (!state) return null;
  }
  await tidy();
  return { outcome: 'merged', state };
}
