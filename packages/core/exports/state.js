// "Exportované" and "zmenené po exporte" (03-features.md § 3.13). When a
// document goes to the accountant the app stores exportedAt and a
// fingerprint of its content. A later change of anything the accountant
// sees changes the fingerprint, and the document shows as changed after
// export. Bookkeeping fields (timestamps, the send log, the lock) are left
// out, so marking a document exported does not itself count as a change.

const IGNORED = new Set(['updatedAt', 'exportedAt', 'exportFingerprint', 'lockedAt', 'sendLog', 'peppol', 'deleted', 'pdfFileId']);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

// FNV-1a over the UTF-16 code units, two seeds for 64 bits: a change
// detector, not a security measure.
function fnv(text, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Fingerprint of what an export of the document contains. */
export function exportFingerprint(document) {
  const content = {};
  Object.keys(document || {}).forEach(k => { if (!IGNORED.has(k)) content[k] = document[k]; });
  const text = canonical(content);
  return `${fnv(text, 0x811c9dc5)}${fnv(text, 0x01000193)}`;
}

// Without a fingerprint (a document marked elsewhere) the timestamps
// decide, with a margin for the store stamping updatedAt after exportedAt.
const MARGIN_MS = 5000;

/** @returns {'NOT_EXPORTED'|'EXPORTED'|'CHANGED_AFTER_EXPORT'} */
export function exportState(document) {
  if (!document || !document.exportedAt) return 'NOT_EXPORTED';
  if (document.exportFingerprint) {
    return document.exportFingerprint === exportFingerprint(document) ? 'EXPORTED' : 'CHANGED_AFTER_EXPORT';
  }
  const exported = Date.parse(document.exportedAt);
  const updated = Date.parse(document.updatedAt || document.exportedAt);
  return updated - exported > MARGIN_MS ? 'CHANGED_AFTER_EXPORT' : 'EXPORTED';
}

/**
 * The patch that marks a document exported now: exportedAt, the
 * fingerprint and the lock (02-architecture.md § 2.4.3) when it has none.
 */
export function exportedPatch(document, now) {
  const patch = { exportedAt: now, exportFingerprint: exportFingerprint(document) };
  if (!document.lockedAt) patch.lockedAt = now;
  return patch;
}
