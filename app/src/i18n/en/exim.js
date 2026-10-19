// English texts: exports, imports, migration, backup (WP-EXIM), in two files
// merged here; a key lives in exactly one of them.
import exportTexts from './exim/export.js';
import importTexts from './exim/import.js';

export default { ...exportTexts, ...importTexts };
