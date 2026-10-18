// The two file roots in Drive (02-architecture.md § 2.4.1):
//   workspace.json.enc        list of companies, client settings, wrapped keys
//   <companyId>/data.json.gz.enc   everything of one company
import { object, ID, SHORT_TEXT, DATE_TIME, NULLABLE_DATE_TIME } from '../common.js';

// Collections of a company data file and the schema of their records. The
// order is the order they appear in the file.
export const COLLECTIONS = Object.freeze([
  'contacts', 'items', 'priceLevels', 'documents', 'recurringTemplates', 'bankTransactions', 'cashBooks',
  'warehouses', 'stockMoves', 'ledgerEntries', 'assets', 'trips', 'reminderPolicies', 'emailTemplates', 'auditLog'
]);

export const workspaceSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Workspace',
  type: 'object',
  properties: {
    schemaVersion: { type: 'integer', minimum: 1 },
    workspaceId: ID,
    updatedAt: DATE_TIME,
    companies: {
      type: 'array',
      items: object({
        id: ID,
        name: SHORT_TEXT,
        folderId: { type: ['string', 'null'], maxLength: 200 },
        updatedAt: DATE_TIME,
        deleted: { type: 'boolean' }
      }, ['id', 'name'])
    },
    activeCompanyId: { type: ['string', 'null'] },
    // Encryption header: the data key wrapped by the password key and by the
    // recovery key. The format is defined by WP-SYNC (ported from WE Budget).
    keys: {
      type: ['object', 'null'],
      properties: {
        kdf: { type: 'string' },
        iterations: { type: 'integer' },
        salt: { type: 'string' },
        wrappedByPassword: { type: 'string' },
        wrappedByRecovery: { type: 'string' },
        recoverySalt: { type: 'string' },
        createdAt: DATE_TIME,
        passwordChangedAt: NULLABLE_DATE_TIME
      }
    },
    settings: { type: 'object' },
    betaToken: { type: ['string', 'null'] }
  },
  required: ['schemaVersion', 'workspaceId', 'companies']
};

export const companyDataSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'CompanyData',
  type: 'object',
  properties: {
    schemaVersion: { type: 'integer', minimum: 1 },
    companyId: ID,
    updatedAt: DATE_TIME,
    company: { type: 'object' },
    ...Object.fromEntries(COLLECTIONS.map(name => [name, { type: 'array', items: { type: 'object' } }]))
  },
  required: ['schemaVersion', 'companyId', 'company']
};
