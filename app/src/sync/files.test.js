import { describe, it, expect } from 'vitest';
import { importAesKey, generateDekBits, toBase64 } from './crypto.js';
import { createKeys } from './keys.js';
import {
  gzip, gunzip, sealBytes, openBytes, encodeJsonFile, decodeJsonFile, encodeWorkspaceFile, decodeWorkspaceFile, readWorkspaceHeader,
  hasMagic, MAGIC, WORKSPACE_FORMAT
} from './files.js';

const FAST = { iterations: 2000 };

describe('encrypted files', () => {
  it('gzips and ungzips', async () => {
    const text = new TextEncoder().encode('a'.repeat(5000));
    const packed = await gzip(text);
    expect(packed.length).toBeLessThan(text.length);
    expect(await gunzip(packed)).toEqual(text);
    await expect(gunzip(new Uint8Array([1, 2, 3]))).rejects.toMatchObject({ code: 'DAMAGED' });
  });

  it('seals bytes under the magic and opens them', async () => {
    const dek = await importAesKey(generateDekBits());
    const file = await sealBytes(dek, new TextEncoder().encode('<Invoice/>'));
    expect(hasMagic(file)).toBe(true);
    expect(Array.from(file.subarray(0, 4))).toEqual(Array.from(MAGIC));
    expect(new TextDecoder().decode(await openBytes(dek, file))).toBe('<Invoice/>');
    const other = await importAesKey(generateDekBits());
    await expect(openBytes(other, file)).rejects.toMatchObject({ code: 'DAMAGED' });
    await expect(openBytes(dek, new TextEncoder().encode('{"plain":1}'))).rejects.toMatchObject({ code: 'DAMAGED' });
  });

  it('round trips a JSON root and hides its content', async () => {
    const dek = await importAesKey(generateDekBits());
    const data = { schemaVersion: 1, companyId: 'c1', company: { name: 'Alfa' }, documents: [{ id: 'd1', number: 'FA20260001' }] };
    const file = await encodeJsonFile(dek, data);
    expect(new TextDecoder().decode(file)).not.toContain('FA20260001');
    expect(await decodeJsonFile(dek, file)).toEqual(data);
  });

  it('writes workspace.json.enc with an open header and a sealed body', async () => {
    const { header, dekBits } = await createKeys('correct horse battery', FAST);
    const dek = await importAesKey(dekBits);
    const workspace = {
      schemaVersion: 1, workspaceId: 'w1', updatedAt: '2026-10-18T09:00:00.000Z',
      companies: [{ id: 'c1', name: 'Alfa s. r. o.', updatedAt: '2026-10-18T09:00:00.000Z' }],
      activeCompanyId: 'c1', keys: header, settings: { language: 'sk' }, betaToken: null
    };
    const text = await encodeWorkspaceFile(dek, workspace);
    expect(text).not.toContain('Alfa');
    const parsed = JSON.parse(text);
    expect(parsed.format).toBe(WORKSPACE_FORMAT);
    expect(parsed.keys).toEqual(header);
    const head = readWorkspaceHeader(text);
    expect(head.workspaceId).toBe('w1');
    expect(head.keys.wrappedByPassword).toBe(header.wrappedByPassword);
    expect(await decodeWorkspaceFile(dek, text)).toEqual(workspace);
    const other = await importAesKey(generateDekBits());
    await expect(decodeWorkspaceFile(other, text)).rejects.toMatchObject({ code: 'DAMAGED' });
  });

  it('refuses foreign, broken and newer workspace files', async () => {
    expect(() => readWorkspaceHeader('nope')).toThrow(/not JSON/);
    expect(() => readWorkspaceHeader('{"companies":[]}')).toThrow(/Not a workspace/);
    const { header } = await createKeys('correct horse battery', FAST);
    const good = { format: WORKSPACE_FORMAT, v: 1, schemaVersion: 1, workspaceId: 'w', keys: header, body: toBase64(new Uint8Array(40)) };
    expect(readWorkspaceHeader(JSON.stringify(good)).workspaceId).toBe('w');
    expect(() => readWorkspaceHeader(JSON.stringify({ ...good, v: 2 }))).toThrow(/NEWER_FORMAT/);
    expect(() => readWorkspaceHeader(JSON.stringify({ ...good, body: '***' }))).toThrow(/DAMAGED/);
    expect(() => readWorkspaceHeader(JSON.stringify({ ...good, keys: null }))).toThrow(/No encryption header/);
  });
});
