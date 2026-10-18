// Schema migrations (02-architecture.md § 2.4.4). MIGRATIONS[n] turns a file
// of version n + 1 into version n + 2: a pure function from old data to new,
// each with its own test. A client that meets a newer version than it knows
// opens the data read-only and asks the user to update.
//
// Adding a migration: write migrate_1_to_2.js exporting a pure function,
// push it here and raise SCHEMA_VERSION in ../index.js.
export const MIGRATIONS = Object.freeze([]);

export function migrate(data, targetVersion) {
  const from = Number(data && data.schemaVersion);
  if (!Number.isInteger(from) || from < 1) {
    throw new Error(`Unknown schema version: ${data && data.schemaVersion}`);
  }
  if (from > targetVersion) return { data, readOnly: true, migrated: false };
  let current = data;
  for (let v = from; v < targetVersion; v++) {
    const step = MIGRATIONS[v - 1];
    if (!step) throw new Error(`No migration from schema ${v} to ${v + 1}`);
    current = { ...step(structuredClone(current)), schemaVersion: v + 1 };
  }
  return { data: current, readOnly: false, migrated: from !== targetVersion };
}
