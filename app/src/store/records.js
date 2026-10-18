// Pure helpers for stored records: ids, timestamps, tombstones and the
// shape checks of the two file roots. Kept apart from the Store so the
// merge and the tests can use them without a store.
import { uuidv7, schema, SCHEMA_VERSION } from '@we-invoice/core';

const { COLLECTIONS } = schema;

export function nowIso() {
  return new Date().toISOString();
}

// A new record: the caller's fields plus id and timestamps (UTC).
export function newRecord(fields = {}, now = nowIso()) {
  return { ...fields, id: fields.id || uuidv7(), createdAt: fields.createdAt || now, updatedAt: now };
}

export function touch(record, patch = {}, now = nowIso()) {
  return { ...record, ...patch, id: record.id, createdAt: record.createdAt, updatedAt: now };
}

// A deleted record stays as a tombstone, so the deletion syncs and an
// older copy cannot bring it back.
export function tombstone(record, now = nowIso()) {
  return { ...record, deleted: true, updatedAt: now };
}

export function isLive(record) {
  return Boolean(record) && !record.deleted;
}

export function live(records) {
  return (records || []).filter(isLive);
}

export function isCollection(name) {
  return COLLECTIONS.includes(name);
}

// Whether a parsed value looks like a company data file: anything else is
// damaged and must never be replaced by an empty file.
export function isCompanyData(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && Number.isInteger(value.schemaVersion) && value.schemaVersion >= 1
    && typeof value.companyId === 'string' && value.companyId.length > 0
    && Boolean(value.company) && typeof value.company === 'object'
    && COLLECTIONS.every(name => value[name] === undefined || Array.isArray(value[name]));
}

export function isWorkspace(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && Number.isInteger(value.schemaVersion) && value.schemaVersion >= 1
    && typeof value.workspaceId === 'string' && value.workspaceId.length > 0
    && Array.isArray(value.companies);
}

// Fills the collections a file lacks (an older or hand-edited file).
export function normalizeCompanyData(data) {
  const out = { ...data };
  COLLECTIONS.forEach(name => { if (!Array.isArray(out[name])) out[name] = []; });
  return out;
}

export function normalizeWorkspace(ws) {
  return {
    ...ws,
    companies: Array.isArray(ws.companies) ? ws.companies : [],
    activeCompanyId: ws.activeCompanyId || null,
    keys: ws.keys || null,
    settings: ws.settings && typeof ws.settings === 'object' ? ws.settings : {},
    betaToken: ws.betaToken || null
  };
}

// Parses a stored text into one of the two roots. Returns { data } or
// { error }: a text that is not JSON, or JSON of the wrong shape, is
// damaged data, which the store keeps untouched.
export function parseRoot(text, kind) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return { error: new Error(`${kind} is not valid JSON`) };
  }
  const ok = kind === 'workspace' ? isWorkspace(value) : isCompanyData(value);
  if (!ok) return { error: new Error(`${kind} has an unexpected shape`) };
  return { data: kind === 'workspace' ? normalizeWorkspace(value) : normalizeCompanyData(value) };
}

export { SCHEMA_VERSION, COLLECTIONS };
