// Data model contract: the schema version, every entity schema, and the map
// from a company data collection to the schema of its records. Changing
// anything here is a "contract:" change (10-work-packages.md § 10.1).
import { companySchema, SERIES } from './entities/company.js';
import { contactSchema } from './entities/contact.js';
import { itemSchema } from './entities/item.js';
import { documentSchema, LINE, PAYMENT, TOTALS } from './entities/document.js';
import { recurringTemplateSchema } from './entities/recurring.js';
import { bankAccountTxSchema, cashRegisterBookSchema } from './entities/money.js';
import { warehouseSchema, stockMoveSchema, priceLevelSchema } from './entities/stock.js';
import { ledgerEntrySchema, assetSchema, tripLogSchema } from './entities/ledger.js';
import { reminderPolicySchema, emailTemplateSchema, auditEntrySchema } from './entities/misc.js';
import { workspaceSchema, companyDataSchema, COLLECTIONS } from './entities/workspace.js';

export const SCHEMA_VERSION = 1;

export const SCHEMAS = Object.freeze({
  Workspace: workspaceSchema,
  CompanyData: companyDataSchema,
  Company: companySchema,
  Contact: contactSchema,
  Item: itemSchema,
  PriceLevel: priceLevelSchema,
  Document: documentSchema,
  RecurringTemplate: recurringTemplateSchema,
  BankAccountTx: bankAccountTxSchema,
  CashRegisterBook: cashRegisterBookSchema,
  Warehouse: warehouseSchema,
  StockMove: stockMoveSchema,
  LedgerEntry: ledgerEntrySchema,
  Asset: assetSchema,
  TripLog: tripLogSchema,
  ReminderPolicy: reminderPolicySchema,
  EmailTemplate: emailTemplateSchema,
  AuditEntry: auditEntrySchema
});

export const COLLECTION_SCHEMA = Object.freeze({
  contacts: 'Contact',
  items: 'Item',
  priceLevels: 'PriceLevel',
  documents: 'Document',
  recurringTemplates: 'RecurringTemplate',
  bankTransactions: 'BankAccountTx',
  cashBooks: 'CashRegisterBook',
  warehouses: 'Warehouse',
  stockMoves: 'StockMove',
  ledgerEntries: 'LedgerEntry',
  assets: 'Asset',
  trips: 'TripLog',
  reminderPolicies: 'ReminderPolicy',
  emailTemplates: 'EmailTemplate',
  auditLog: 'AuditEntry'
});

export { COLLECTIONS, SERIES, LINE, PAYMENT, TOTALS };
export * from './enums.js';
export { emptyCompanyData, emptyWorkspace } from './empty.js';
export { migrate, MIGRATIONS } from './migrations/index.js';
