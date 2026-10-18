// Drafts deleted with Undo still pending: they disappear from the lists at
// once and leave the store only when the undo toast is gone.
const pending = new Set();

export function markPending(id) {
  pending.add(id);
}

export function clearPending(id) {
  pending.delete(id);
}

export function isPending(id) {
  return pending.has(id);
}
