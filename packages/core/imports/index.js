// Migration from other programs and file imports (WP-EXIM). Every importer
// returns a report of what came in, what was skipped and why.
import { NotImplementedError } from '../errors.js';

export function importIdoklad(files, ctx) { throw new NotImplementedError('importIdoklad'); }
export function importSuperfaktura(xml, ctx) { throw new NotImplementedError('importSuperfaktura'); }
export function importKros(file, ctx) { throw new NotImplementedError('importKros'); }
export function importPohoda(xml, ctx) { throw new NotImplementedError('importPohoda'); }
export function importCsv(text, mapping, ctx) { throw new NotImplementedError('importCsv'); }
/** Lines of an invoice from a WE Time Tracker JSON export. */
export function importTimeTracker(json, ctx) { throw new NotImplementedError('importTimeTracker'); }
