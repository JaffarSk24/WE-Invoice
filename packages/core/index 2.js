// Public API of @we-invoice/core: the contract between the core and the app
// (10-work-packages.md § 10.1). Pure functions only, no DOM, no network.
//
// Each work package implements the functions of its own modules; the names
// and parameters below are fixed by WP-0. Until implemented, a function
// throws NotImplementedError. A package that needs a new public function
// adds it to its own module: the re-exports pick it up without touching
// this file. Renaming or removing a name is a "contract:" change.

export * from './errors.js';
export * from './ids/index.js';
export * from './money/index.js';
export * from './vat/index.js';
export * from './numbering/index.js';
export * from './documents/index.js';
export * from './payments/index.js';
export * from './payments/bank/index.js';
export * from './legislation/index.js';
export * from './peppol/index.js';
export * from './ubl/index.js';
export * from './isdoc/index.js';
export * from './paybysquare/index.js';
export * from './tax/index.js';
export * from './ledger/index.js';
export * from './exports/index.js';
export * from './imports/index.js';
export * from './imports/inbox/index.js';
export * from './stock/index.js';
export * from './reports/index.js';
export * from './ekasa/index.js';
export * as schema from './schema/index.js';
export { SCHEMA_VERSION } from './schema/index.js';
