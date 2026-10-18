// Checks on the data document before it is written to disk, kept pure so
// they can be tested without Electron. The main process does not know the
// document's schema (the store of WP-SYNC owns it); it only makes sure that
// a corrupt, empty or nearly emptied document never silently replaces a
// good one.

const MIN_RECORDS_FOR_REPLACE_CHECK = 20;

// A document is a JSON object. Anything else (an empty string, "null", an
// array, a number) is refused by the save.
function parseDocument(json) {
  if (typeof json !== 'string' || !json.trim()) return null;
  try {
    const doc = JSON.parse(json);
    return doc && typeof doc === 'object' && !Array.isArray(doc) ? doc : null;
  } catch (e) {
    return null;
  }
}

// Ids of the live records: every object with an id inside the top-level
// arrays and one level of nested arrays. Deleted records stay as tombstones
// in a synced store, so they do not count.
function liveRecordIds(doc) {
  const ids = new Set();
  const visit = (value, depth) => {
    if (!value || typeof value !== 'object' || depth > 2) return;
    if (Array.isArray(value)) {
      value.forEach(item => {
        if (item && typeof item === 'object' && !Array.isArray(item) && item.id != null && !item.deleted) ids.add(String(item.id));
        visit(item, depth + 1);
      });
      return;
    }
    Object.values(value).forEach(v => visit(v, depth + 1));
  };
  visit(doc, 0);
  return ids;
}

// True when more than half of a sizeable document's records are about to
// disappear at once: a restore from file, an import or a demo, after which
// the old file deserves a copy under its own name.
function looksLikeFullReplace(prevJson, nextJson) {
  const prev = parseDocument(prevJson);
  const next = parseDocument(nextJson);
  if (!prev || !next) return false;
  const before = liveRecordIds(prev);
  if (before.size < MIN_RECORDS_FOR_REPLACE_CHECK) return false;
  const after = liveRecordIds(next);
  let kept = 0;
  before.forEach(id => { if (after.has(id)) kept++; });
  return kept < before.size / 2;
}

module.exports = { parseDocument, liveRecordIds, looksLikeFullReplace, MIN_RECORDS_FOR_REPLACE_CHECK };
