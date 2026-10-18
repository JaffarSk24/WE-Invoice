// Merging two copies of the same root, record by record. Ported from
// WE Budget (02-architecture.md § 2.6).
//
// Every record carries updatedAt; the newer copy of a record wins. Deleted
// records are tombstones, so a deletion travels like any other change and
// an older copy of the record cannot bring it back. Nothing is ever
// dropped: a record known on one side only is kept. The result does not
// depend on which side is called local and which remote: two devices
// merging the same pair end up with the same root.
import { schema } from '@we-invoice/core';
import { canonical } from './hash.js';

const { COLLECTIONS } = schema;

export function newer(a, b) {
  if (!a) return b;
  if (!b) return a;
  if ((a.updatedAt || '') > (b.updatedAt || '')) return a;
  if ((a.updatedAt || '') < (b.updatedAt || '')) return b;
  // Same timestamp, different content: pick by content so both sides agree.
  return canonical(a) >= canonical(b) ? a : b;
}

// Merges two lists of records by id. Records keep the order of the local
// list, then the remote-only ones in their order.
export function mergeRecords(mine, theirs) {
  const remote = new Map((theirs || []).map(r => [r.id, r]));
  const seen = new Set();
  const merged = [];
  let localChanged = false;
  let remoteChanged = false;
  (mine || []).forEach(l => {
    seen.add(l.id);
    const r = remote.get(l.id);
    if (!r) {
      merged.push(l);
      remoteChanged = true;
      return;
    }
    const rec = newer(l, r);
    const key = canonical(rec);
    if (key !== canonical(l)) localChanged = true;
    if (key !== canonical(r)) remoteChanged = true;
    merged.push(rec);
  });
  (theirs || []).forEach(r => {
    if (seen.has(r.id)) return;
    merged.push(r);
    localChanged = true;
  });
  return { records: merged, localChanged, remoteChanged };
}

function laterIso(a, b) {
  return (a || '') > (b || '') ? a : b;
}

// One company's data: every collection by record, the company record by
// updatedAt.
export function mergeCompanyData(local, remote) {
  let localChanged = false;
  let remoteChanged = false;
  const out = { ...local };
  COLLECTIONS.forEach(name => {
    const m = mergeRecords(local[name] || [], remote[name] || []);
    out[name] = m.records;
    localChanged = localChanged || m.localChanged;
    remoteChanged = remoteChanged || m.remoteChanged;
  });
  const company = newer(local.company, remote.company);
  if (canonical(company) !== canonical(local.company)) localChanged = true;
  if (canonical(company) !== canonical(remote.company)) remoteChanged = true;
  out.company = company;
  out.schemaVersion = Math.max(local.schemaVersion || 1, remote.schemaVersion || 1);
  out.updatedAt = laterIso(local.updatedAt, remote.updatedAt);
  return { data: out, localChanged, remoteChanged };
}

// The encryption header: the one whose password was set later wins (a
// password changed on one device must not be undone by another).
export function newerKeys(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  const stamp = (k) => k.passwordChangedAt || k.createdAt || '';
  if (stamp(a) > stamp(b)) return a;
  if (stamp(a) < stamp(b)) return b;
  return canonical(a) >= canonical(b) ? a : b;
}

// The workspace: the company list by record; settings and the beta token
// from the copy saved later; the keys by newerKeys. activeCompanyId is a
// device choice and stays local.
export function mergeWorkspace(local, remote) {
  const m = mergeRecords(local.companies || [], remote.companies || []);
  let { localChanged, remoteChanged } = m;
  const head = newer(local, remote);
  const picked = { settings: head.settings || {}, betaToken: head.betaToken || null, keys: newerKeys(local.keys, remote.keys) };
  const same = (a, b) => canonical(a) === canonical(b);
  const view = (ws) => ({ settings: ws.settings || {}, betaToken: ws.betaToken || null, keys: ws.keys || null });
  if (!same(picked, view(local))) localChanged = true;
  if (!same(picked, view(remote))) remoteChanged = true;
  const data = {
    ...local,
    ...picked,
    companies: m.records,
    schemaVersion: Math.max(local.schemaVersion || 1, remote.schemaVersion || 1),
    updatedAt: laterIso(local.updatedAt, remote.updatedAt),
    activeCompanyId: local.activeCompanyId || null
  };
  return { data, localChanged, remoteChanged };
}
