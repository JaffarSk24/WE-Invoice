// Vitest setup: a minimal localStorage for modules that read preferences in
// the node environment. Tests that need a DOM opt into happy-dom per file.
class LocalStorageMock {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

if (!globalThis.localStorage) globalThis.localStorage = new LocalStorageMock();
