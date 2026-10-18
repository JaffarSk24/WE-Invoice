// Cache of public data (registers, VIES, rates, Peppol lookup) in SQLite
// with a TTL per entry. Only public answers are cached, never anything a
// user sent. Expired rows are swept lazily on write.
export function createCache(db, { now = Date.now } = {}) {
  const get = db.prepare('SELECT value, expires_at FROM cache WHERE key = ?');
  const put = db.prepare('INSERT OR REPLACE INTO cache (key, value, expires_at) VALUES (?, ?, ?)');
  const sweep = db.prepare('DELETE FROM cache WHERE expires_at < ?');
  let writes = 0;

  return {
    get(key) {
      const row = get.get(key);
      if (!row || row.expires_at < now()) return undefined;
      return JSON.parse(row.value);
    },
    set(key, value, ttlMs) {
      put.run(key, JSON.stringify(value), now() + ttlMs);
      if (++writes % 100 === 0) sweep.run(now());
    },
    // Runs the loader once per key and TTL; the TTL may depend on the value
    // (rates of today expire at midnight, older ones stay for a month).
    async remember(key, ttl, loader) {
      const hit = this.get(key);
      if (hit !== undefined) return hit;
      const value = await loader();
      const ttlMs = typeof ttl === 'function' ? ttl(value) : ttl;
      if (ttlMs > 0) this.set(key, value, ttlMs);
      return value;
    }
  };
}

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;
