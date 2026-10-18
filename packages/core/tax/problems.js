// Problems found while the VAT records and reports are built (§ 5.3.4 of
// the specification): each has a stable code that the interface shows as
// tax.problem.<code>, a severity (an error blocks the XML export, a
// warning is shown and may be accepted) and the document it is about, so
// the screen can link straight to it.

/**
 * @param {string} code
 * @param {object|null} document
 * @param {{severity?: 'error'|'warning', field?: string, params?: object}} [options]
 * @returns {{code: string, severity: string, docId: string|null, number: string|null, kind: string|null, field: string|null, params: object}}
 */
export function problem(code, document, options = {}) {
  return {
    code,
    severity: options.severity || 'error',
    docId: document ? document.id || null : null,
    number: document ? document.number || null : null,
    kind: document ? document.kind || null : null,
    field: options.field || null,
    params: options.params || {}
  };
}

/** True when no problem blocks the export. */
export function canExport(problems) {
  return !(problems || []).some(p => p.severity === 'error');
}

/** Errors first, then warnings, each in document number order. */
export function sortProblems(problems) {
  const rank = (p) => (p.severity === 'error' ? 0 : 1);
  return [...(problems || [])].sort((a, b) => rank(a) - rank(b) || String(a.number || '').localeCompare(String(b.number || '')) || a.code.localeCompare(b.code));
}

/** One list of several (records, checks, report), each problem once, sorted. */
export function mergeProblems(...lists) {
  const seen = new Set();
  const out = [];
  for (const p of lists.flat()) {
    if (!p) continue;
    const key = `${p.code}|${p.docId || ''}|${JSON.stringify(p.params || {})}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return sortProblems(out);
}
