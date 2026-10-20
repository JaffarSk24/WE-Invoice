// The import report (03-features.md § 3.13): what came in, what was
// skipped and why, and what needs a look. Reasons are stable codes the
// app translates (exim.import.reason.<CODE>), with the record's reference
// (a number, a name) so the user can find it in the source file.

export const ENTITIES = Object.freeze(['contacts', 'items', 'documents']);

export function createReport() {
  return {
    added: { contacts: 0, items: 0, documents: 0 },
    linked: { contacts: 0 },
    skipped: [],
    warnings: []
  };
}

export function skip(report, entity, ref, reason) {
  report.skipped.push({ entity, ref: ref == null ? '' : String(ref), reason });
}

export function warn(report, entity, ref, code) {
  report.warnings.push({ entity, ref: ref == null ? '' : String(ref), code });
}

/** Merges the reports of several files into one. */
export function mergeReports(reports) {
  const out = createReport();
  reports.forEach(r => {
    ENTITIES.forEach(e => { out.added[e] += r.added[e] || 0; });
    out.linked.contacts += (r.linked && r.linked.contacts) || 0;
    out.skipped.push(...r.skipped);
    out.warnings.push(...r.warnings);
  });
  return out;
}

/** Parsed content of a source: drafts of records, plus the report of reading it. */
export function emptyParsed() {
  return { contacts: [], items: [], documents: [], report: createReport() };
}
