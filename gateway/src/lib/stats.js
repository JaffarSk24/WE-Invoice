// Counters without personal data: requests, errors and upstream failures
// per route and day, plus the recent health of each upstream. Kept in
// SQLite so a restart does not lose the day (06-gateway-server.md § 6.5).
export function createStats(db) {
  const bump = db.prepare(`
    INSERT INTO stats (day, route, requests, errors, upstream_errors, duration_ms)
    VALUES (@day, @route, 1, @errors, @upstream, @duration)
    ON CONFLICT (day, route) DO UPDATE SET
      requests = requests + 1, errors = errors + excluded.errors,
      upstream_errors = upstream_errors + excluded.upstream_errors, duration_ms = duration_ms + excluded.duration_ms`);
  const read = db.prepare('SELECT day, route, requests, errors, upstream_errors AS upstreamErrors, duration_ms AS durationMs FROM stats WHERE day >= ? ORDER BY day, route');
  const upstreams = new Map();

  return {
    record({ route, statusCode, durationMs, upstreamError = false }) {
      bump.run({
        day: new Date().toISOString().slice(0, 10),
        route: route || 'unknown',
        errors: statusCode >= 400 ? 1 : 0,
        upstream: upstreamError ? 1 : 0,
        duration: Math.max(0, Math.round(durationMs || 0))
      });
    },
    upstream(name, ok) {
      upstreams.set(name, { ok, at: Date.now() });
    },
    upstreamStatus() {
      const out = {};
      for (const [name, { ok, at }] of upstreams) out[name] = Date.now() - at > 60 * 60 * 1000 ? 'unknown' : ok ? 'ok' : 'down';
      return out;
    },
    snapshot(days = 30) {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const rows = read.all(since);
      const totals = rows.reduce((t, r) => ({
        requests: t.requests + r.requests, errors: t.errors + r.errors, upstreamErrors: t.upstreamErrors + r.upstreamErrors, durationMs: t.durationMs + r.durationMs
      }), { requests: 0, errors: 0, upstreamErrors: 0, durationMs: 0 });
      return {
        since,
        totals: { ...totals, avgDurationMs: totals.requests ? Math.round(totals.durationMs / totals.requests) : 0 },
        routes: rows.map(r => ({ ...r, avgDurationMs: r.requests ? Math.round(r.durationMs / r.requests) : 0 })),
        upstreams: this.upstreamStatus()
      };
    }
  };
}
