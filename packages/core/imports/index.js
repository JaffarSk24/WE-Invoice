// Migration from other programs and file imports (WP-EXIM). Every importer
// returns drafts ({ contacts, items, documents }) and a report of what was
// read, what was skipped and why; buildImportPlan matches them against the
// company's data for the preview and applyImportPlan adds the new ones.
export { importIdoklad, importSuperfaktura, importKros, importCsv } from './programs.js';
export { importPohoda } from './pohoda.js';
export { importOmegaText } from './omega.js';
export { importRows } from './table.js';
export { importTimeTracker, readTimeTracker, timeTrackerClients, timeTrackerStatus, TT_GROUPINGS, TT_STATUS_FORMAT } from './timetracker.js';
export { buildImportPlan, applyImportPlan, contactKey as importContactKey, documentKey as importDocumentKey, itemKey as importItemKey } from './plan.js';
export { continueSeries } from './series.js';
export { guessMapping, guessEntity, fieldsOf as importFields, FIELDS as IMPORT_FIELDS } from './mapping.js';
export { readCsv, decodeText, detectDelimiter } from './csv.js';
export { readXlsx } from './xlsx.js';
export { readZip, isZip } from './zip.js';
export { parseBackup, planRestore } from './backup.js';
export { createReport, mergeReports } from './report.js';
