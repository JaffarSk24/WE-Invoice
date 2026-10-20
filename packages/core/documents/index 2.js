// Document lifecycle, statuses, conversions and legal checks (WP-CORE).
// Each concern lives in its own file; this one only gathers the API.
export { ublTypeCode, allowedStatuses, canTransition, isTaxDocument, isPayable, isReceived, TAX_KINDS, PAYABLE_KINDS } from './kinds.js';
export { documentStatus, canEdit, canUnlock } from './status.js';
export { convertDocument, conversionTargets } from './convert.js';
export { missingParticulars, requiredTexts } from './particulars.js';
export { issueDocument } from './issue.js';
export { companySnapshot, contactSnapshot } from './snapshots.js';
export { localDate, addDays, diffDays, isDate, assertDate, dateParts, LOCAL_TIME_ZONE } from './dates.js';
