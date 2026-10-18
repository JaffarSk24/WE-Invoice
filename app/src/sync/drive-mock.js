// An in-memory Drive with the bridge shape of remote.js, for the tests and
// the demo: paths relative to the WE Invoice folder, versions that move on
// every write, a list of direct children per folder.
import { folderOf, nameOf } from './remote.js';

export function mockDrive() {
  const files = new Map();
  let seq = 0;
  let clock = 0;
  const stamp = () => new Date(Date.UTC(2026, 9, 18, 9, 0, 0, clock++)).toISOString();
  const drive = {
    files,
    writes: 0,
    failNext: null,
    check() {
      if (drive.failNext) {
        const err = new Error(drive.failNext);
        err.code = drive.failNext;
        drive.failNext = null;
        throw err;
      }
    },
    async list(folder) {
      drive.check();
      const prefix = folder ? `${folder}/` : '';
      const seen = new Map();
      files.forEach((file, path) => {
        if (!path.startsWith(prefix)) return;
        const rest = path.slice(prefix.length);
        const slash = rest.indexOf('/');
        if (slash < 0) seen.set(rest, { name: rest, path, id: file.id, isFolder: false, size: file.bytes.length, version: file.version, modifiedTime: file.modifiedTime });
        else if (!seen.has(rest.slice(0, slash))) seen.set(rest.slice(0, slash), { name: rest.slice(0, slash), path: prefix + rest.slice(0, slash), id: `folder-${rest.slice(0, slash)}`, isFolder: true, size: 0, version: null, modifiedTime: null });
      });
      return Array.from(seen.values());
    },
    async get(path) {
      drive.check();
      const file = files.get(path);
      return file ? { bytes: file.bytes, id: file.id, version: file.version, modifiedTime: file.modifiedTime } : null;
    },
    async put(path, data) {
      drive.check();
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      const old = files.get(path);
      drive.writes++;
      const file = { bytes, id: old ? old.id : `file-${++seq}`, version: String((old ? Number(old.version) : 0) + 1), modifiedTime: stamp() };
      files.set(path, file);
      return { id: file.id, version: file.version, modifiedTime: file.modifiedTime };
    },
    async delete(path) {
      drive.check();
      return files.delete(path);
    },
    // Test helpers.
    text: (path) => (files.has(path) ? new TextDecoder().decode(files.get(path).bytes) : null),
    paths: () => Array.from(files.keys()).sort(),
    folderOf,
    nameOf
  };
  return drive;
}
