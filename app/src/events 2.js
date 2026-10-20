// A tiny event bus between modules (e.g. "data:changed", "company:switched",
// "language:changed"), so modules do not import each other's internals.
const handlers = new Map();

export function on(event, fn) {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event).add(fn);
  return () => handlers.get(event).delete(fn);
}

export function emit(event, payload) {
  (handlers.get(event) || []).forEach(fn => {
    try { fn(payload); } catch (e) { console.error(`Handler of ${event} failed`, e); }
  });
}
