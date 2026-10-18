// Labels (tags) and projects of documents and contacts: the distinct
// values in use with how often they appear, for filters and pickers.
// Labels are free text; two spellings that differ only in case or
// surrounding spaces are one label.

function tally(values) {
  const seen = new Map();
  for (const raw of values) {
    const value = String(raw ?? '').trim();
    if (!value) continue;
    const key = value.toLowerCase();
    const entry = seen.get(key);
    if (entry) entry.count += 1;
    else seen.set(key, { value, count: 1 });
  }
  return Array.from(seen.values()).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/** Labels used on live records: [{ value, count }], most used first. */
export function collectLabels(records) {
  return tally((records || []).filter(r => r && !r.deleted).flatMap(r => r.tags || []));
}

/** Projects (projectRef) used on live documents: [{ value, count }]. */
export function collectProjects(documents) {
  return tally((documents || []).filter(d => d && !d.deleted).map(d => d.projectRef));
}

/** A label list cleaned for storing: trimmed, no empty values, no duplicates. */
export function normalizeLabels(labels) {
  return tally(labels || []).map(l => l.value);
}
