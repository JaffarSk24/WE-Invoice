// SQLite storage of the gateway: waitlist, beta invites, the public data
// cache and request counters. No user documents ever land here. The schema
// is created on open and versioned by user_version for later migrations.
import Database from 'better-sqlite3';

const SCHEMA_VERSION = 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS waitlist (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  lang TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  source TEXT,
  interests TEXT NOT NULL DEFAULT '[]',
  vat_payer INTEGER,
  consent_at TEXT NOT NULL,
  confirmed_at TEXT,
  confirm_token TEXT UNIQUE,
  confirm_expires_at TEXT,
  unsubscribe_token TEXT NOT NULL UNIQUE,
  last_activity_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY,
  email TEXT,
  created_at TEXT NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 3,
  uses INTEGER NOT NULL DEFAULT 0,
  last_redeemed_at TEXT,
  revoked_at TEXT
);
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
