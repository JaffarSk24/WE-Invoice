// The device store of Inbox files and attachments with Drive behind it:
// a file this device lacks is asked from the registered provider, a file
// it has is never; keeping and dropping files is announced.
import { describe, it, expect, afterEach } from 'vitest';
import { putFile, getFile, deleteFile, setRemoteFiles, localFiles } from './file-store.js';

const file = (text) => ({ name: 'a.pdf', type: 'application/pdf', bytes: new TextEncoder().encode(text), pages: [] });

function provider(remote = new Map()) {
  const calls = { fetch: [], added: [], removed: [] };
  return {
    calls,
    fetch: async (id) => { calls.fetch.push(id); return remote.get(id) || null; },
    added: (id) => calls.added.push(id),
    removed: (id) => calls.removed.push(id)
  };
}

afterEach(() => setRemoteFiles(null));

describe('file store with Drive behind it', () => {
  it('works on the device alone without a provider', async () => {
    await putFile('fs-1', file('one'));
    expect((await getFile('fs-1')).name).toBe('a.pdf');
    expect(await localFiles.keys()).toContain('fs-1');
    await deleteFile('fs-1');
    expect(await getFile('fs-1')).toBeNull();
  });

  it('asks Drive only for a file this device lacks', async () => {
    const p = provider(new Map([['fs-remote', file('from drive')]]));
    setRemoteFiles(p);
    await putFile('fs-2', file('here'));
    expect(p.calls.added).toEqual(['fs-2']);
    expect(new TextDecoder().decode((await getFile('fs-2')).bytes)).toBe('here');
    expect(p.calls.fetch).toEqual([]);
    expect(new TextDecoder().decode((await getFile('fs-remote')).bytes)).toBe('from drive');
    expect(await getFile('fs-none')).toBeNull();
    expect(p.calls.fetch).toEqual(['fs-remote', 'fs-none']);
    await deleteFile('fs-2');
    expect(p.calls.removed).toEqual(['fs-2']);
  });

  it('answers null when Drive fails, and survives a listener that throws', async () => {
    setRemoteFiles({ fetch: async () => { throw new Error('boom'); }, added: () => { throw new Error('listener'); } });
    expect(await getFile('fs-broken')).toBeNull();
    await expect(putFile('fs-3', file('x'))).resolves.toBeUndefined();
    await deleteFile('fs-3');
  });
});
