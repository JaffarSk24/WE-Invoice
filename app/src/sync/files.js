// The two file formats in Drive (02-architecture.md § 2.4.1), as pure
// functions over bytes and the DEK:
//
//   workspace.json.enc        JSON text with an open header and a sealed body:
//                             { format, v, schemaVersion, workspaceId, keys, body }
//                             `keys` is the encryption header (keys.js), readable
//                             without any key, so a new device can ask for the
//                             password; `body` is the rest of the workspace,
//                             sealed with the DEK (base64 of iv + ciphertext).
//   <companyId>/data.json.gz.enc, backups/*.json.gz.enc, archive and
//   attachments                binary: the 4-byte magic "WEI1", then iv (12)
//                             and the AES-GCM ciphertext of the gzip of the
//                             content. The company and backup files hold the
//                             gzip of the JSON text; archive and attachment
//                             files the gzip of their bytes.
import { seal, open, toBase64, fromBase64, B64, cryptoError, concat } from './crypto.js';
import { parseHeader } from './keys.js';

export const WORKSPACE_FORMAT = 'we-invoice-workspace';
export const WORKSPACE_VERSION = 1;
export const MAGIC = new Uint8Array([0x57, 0x45, 0x49, 0x31]); // "WEI1"
const utf8 = new TextEncoder();
const utf8d = new TextDecoder();

// ---------- gzip ----------

export async function gzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function gunzip(bytes) {
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (e) {
    throw cryptoError('DAMAGED', 'Not a gzip stream');
  }
}

// ---------- binary files ----------

export function hasMagic(bytes) {
  return bytes instanceof Uint8Array && bytes.length >= MAGIC.length && MAGIC.every((b, i) => bytes[i] === b);
}

// Seals any bytes into a .enc file: magic + iv + ciphertext of their gzip.
export async function sealBytes(dek, bytes) {
  return concat(MAGIC, await seal(dek, await gzip(bytes)));
}

export async function openBytes(dek, file) {
  if (!hasMagic(file)) throw cryptoError('DAMAGED', 'Not a WE Invoice encrypted file');
  return gunzip(await open(dek, file.subarray(MAGIC.length)));
}

// A JSON root as a file, and back. The parsed value is returned as is; the
// caller checks its shape (store/records.js), so a damaged file never
// replaces good data.
export async function encodeJsonFile(dek, value) {
  return sealBytes(dek, utf8.encode(JSON.stringify(value)));
}

export async function decodeJsonFile(dek, file) {
  const text = utf8d.decode(await openBytes(dek, file));
  try {
    return JSON.parse(text);
  } catch (e) {
    throw cryptoError('DAMAGED', 'Decrypted file is not JSON');
  }
}

// ---------- workspace.json.enc ----------

export async function encodeWorkspaceFile(dek, workspace) {
  const { keys, ...rest } = workspace;
  parseHeader(keys);
  const body = await seal(dek, utf8.encode(JSON.stringify(rest)));
  return JSON.stringify({
    format: WORKSPACE_FORMAT,
    v: WORKSPACE_VERSION,
    schemaVersion: workspace.schemaVersion,
    workspaceId: workspace.workspaceId,
    keys,
    body: toBase64(body)
  });
}

// The open part of the file: enough to ask for the password. Throws
// DAMAGED when the text is not a workspace file, NEWER_FORMAT when it was
// written by a newer client.
export function readWorkspaceHeader(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (e) {
    throw cryptoError('DAMAGED', 'workspace.json.enc is not JSON');
  }
  if (!value || value.format !== WORKSPACE_FORMAT) throw cryptoError('DAMAGED', 'Not a workspace file');
  if (value.v > WORKSPACE_VERSION) throw cryptoError('NEWER_FORMAT');
  if (typeof value.body !== 'string' || !B64.test(value.body) || typeof value.workspaceId !== 'string') throw cryptoError('DAMAGED');
  parseHeader(value.keys);
  return { schemaVersion: value.schemaVersion, workspaceId: value.workspaceId, keys: value.keys, body: value.body };
}

export async function decodeWorkspaceFile(dek, text) {
  const head = readWorkspaceHeader(text);
  const plain = utf8d.decode(await open(dek, fromBase64(head.body)));
  let rest;
  try {
    rest = JSON.parse(plain);
  } catch (e) {
    throw cryptoError('DAMAGED', 'Workspace body is not JSON');
  }
  return { ...rest, workspaceId: head.workspaceId, keys: head.keys };
}
