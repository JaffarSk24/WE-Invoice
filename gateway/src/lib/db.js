// SQLite storage of the gateway: the public data cache and request
// counters. No user documents or personal data ever land here. The schema
// is created on open and versioned by user_version for later migrations.
// Databases from before 30 October 2026 still hold the tables of the
// retired waiting list (waitlist, invites); nothing reads them any more.
import Database from 'better-sqlite3';

const SCHEMA_VERSION = 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS cache_expires ON cache (expires_at);
CREATE TABLE IF NOT EXISTS stats (
  day TEXT NOT NULL,
  route TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  upstream_errors INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, route)
);
`;

export function openDb(path = ':memory:') {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  const version = db.pragma('user_version', { simple: true });
  if (version < SCHEMA_VERSION) {
    db.exec(SCHEMA);
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  }
  return db;
}
