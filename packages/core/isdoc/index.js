// ISDOC 6 export and import (Czech standard), WP-EXIM: buildIsdoc writes
// a document as ISDOC 6.0.2, parseIsdoc reads one into the data model.
export { buildIsdoc, documentUuid } from './build.js';
export { parseIsdoc } from './parse.js';
export { ISDOC_NS, ISDOC_VERSION } from './codes.js';
