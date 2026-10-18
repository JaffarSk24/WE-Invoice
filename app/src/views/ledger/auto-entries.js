// Keeps the automatic ledger entries of a bookkeeping company in line
// with the payments on its documents (core planEntrySync). It runs after
// documents or bank lines change, a little later so a burst of changes is
// one pass, and never in demo mode, on a read-only file or for a company
// without bookkeeping. Its own writes do not trigger it again.
import { planEntrySync } from '@we-invoice/core';
import { getStore, hasStore } from '../../store/index.js';
import { isDemo } from '../shell/demo-mode.js';
import { ledgerMode, BOOKKEEPING_MODES } from './state.js';

const WATCHED = new Set(['documents', 'bankTransactions', 'company', null]);
const DELAY_MS = 400;

let timer = null;
let running = null;
let lastWarnings = [];

/** Warnings of the last pass (expense without a category, set-off, ...). */
export function autoEntryWarnings() {
  return lastWarnings.slice();
}

function writable(store) {
  return store && !store.readOnly && store.company() && !isDemo() && BOOKKEEPING_MODES.includes(ledgerMode(store.company()));
}

/**
 * One pass: plans and applies the changes. Returns the counts written.
 * @param {object} [store]
 */
export async function syncAutoEntries(store = hasStore() ? getStore() : null) {
  if (!writable(store)) return { inserted: 0, updated: 0, removed: 0, skipped: true };
  const plan = planEntrySync({
    documents: store.list('documents'),
    entries: store.list('ledgerEntries', { includeDeleted: true }),
    company: store.company(),
    bankTransactions: store.list('bankTransactions')
  });
  lastWarnings = plan.warnings;
  for (const entry of plan.insert) await store.insert('ledgerEntries', entry);
  for (const { id, patch } of plan.update) await store.update('ledgerEntries', id, patch);
  for (const id of plan.remove) await store.remove('ledgerEntries', id);
  return { inserted: plan.insert.length, updated: plan.update.length, removed: plan.remove.length, skipped: false };
}

function schedule(onError) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    // One pass at a time; a change during a pass schedules the next one.
    if (running) { schedule(onError); return; }
    running = syncAutoEntries().catch(onError).finally(() => { running = null; });
  }, DELAY_MS);
}

/** Starts listening; returns a function that stops it. */
export function startAutoEntries({ on, onError }) {
  const offs = [
    on('data:changed', (payload) => { if (WATCHED.has(payload?.collection ?? null)) schedule(onError); }),
    on('company:switched', () => schedule(onError))
  ];
  schedule(onError);
  return () => { clearTimeout(timer); offs.forEach(off => typeof off === 'function' && off()); };
}
