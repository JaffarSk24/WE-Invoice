// The two kinds of root the engine syncs, as cycle.js specs: how to read,
// write, merge and apply the workspace and one company's data.
import { mergeWorkspace, mergeCompanyData } from './merge.js';
import { resolveNumberConflicts } from './conflicts.js';
import { isCompanyData, isWorkspace } from '../store/records.js';
import { PATHS } from './remote.js';
import { cryptoError } from './crypto.js';
import { schema } from '@we-invoice/core';

const { COLLECTIONS } = schema;

function checked(kind, data) {
  const ok = kind === 'workspace' ? isWorkspace(data) : isCompanyData(data);
  if (!ok) throw cryptoError('DAMAGED', `The cloud ${kind} has an unexpected shape`);
  return data;
}

// Anything recorded, deletions included: a reset is work too.
export function companyHasWork(data) {
  return COLLECTIONS.some(name => (data[name] || []).length > 0) || Boolean(data.company && data.company.name);
}

export function workspaceSpec({ store, remote }) {
  return {
    path: PATHS.workspace,
    local: () => store.workspace,
    hasWork: (ws) => Boolean(ws.keys),
    read: async () => {
      const r = await remote.readWorkspace();
      if (!r) return null;
      if (r.locked) throw cryptoError('LOCKED');
      return { data: checked('workspace', r.workspace), version: r.version };
    },
    readAt: async () => null,
    write: (ws) => remote.writeWorkspace(ws),
    apply: (ws) => store.applySyncedWorkspace(ws),
    merge: mergeWorkspace,
    keep: () => {}
  };
}

export function companySpec({ store, remote, companyId, onConflicts = null, now, numbering = {} }) {
  return {
    path: PATHS.company(companyId),
    local: () => (store.data && store.data.companyId === companyId ? store.data : null),
    hasWork: companyHasWork,
    read: async () => {
      const r = await remote.readCompany(companyId);
      return r ? { data: checked('company', r.data), version: r.version } : null;
    },
    readAt: async (path) => {
      const r = await remote.readCompanyAt(path);
      return r ? { data: checked('company', r.data), version: r.version } : null;
    },
    write: (data) => remote.writeCompany(data),
    apply: (data) => store.storeCompanyData(data),
    merge: mergeCompanyData,
    keep: (tag, data) => remote.keepBackup(companyId, data, tag),
    afterMerge: (data) => {
      const result = resolveNumberConflicts(data, { now: now(), ...numbering });
      if (result.conflicts.length && onConflicts) onConflicts(result);
      return result.data;
    }
  };
}
