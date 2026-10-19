// Czech texts of sales, one file per work package, merged here; a key
// lives in exactly one of them.
import documents from './sales/documents.js';
import crm from './sales/crm.js';

export default { ...documents, ...crm };
