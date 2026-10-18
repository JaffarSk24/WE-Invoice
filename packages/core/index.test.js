// The public API contract of WP-0: these names exist and are functions.
// A work package replaces a stub with the implementation; removing or
// renaming a name is a "contract:" change.
import { describe, it, expect } from 'vitest';
import * as core from './index.js';

const API = [
  'add', 'sub', 'mul', 'div', 'cmp', 'round', 'roundCash', 'formatAmount', 'parseAmount', 'convert',
  'computeTotals', 'lineNet', 'grossToNet', 'vatRatesOn',
  'formatNumber', 'nextNumber', 'vsFromNumber', 'findNumberConflicts',
  'ublTypeCode', 'allowedStatuses', 'documentStatus', 'canEdit', 'convertDocument', 'missingParticulars', 'issueDocument',
  'paymentState', 'amountDue', 'lateInterest', 'parseBankStatement', 'matchBankTx', 'buildPain001',
  'getLegislation', 'unverifiedLegislation', 'peppolRequirement', 'participantId',
  'buildUbl', 'parseUbl', 'validateUblLocal', 'buildIsdoc', 'parseIsdoc', 'payBySquare', 'decodePayBySquare', 'qrPlatba',
  'vatRecords', 'buildKv', 'buildSv', 'buildVatReturn', 'registrationTurnover',
  'entriesForPayment', 'cashJournal', 'depreciationPlan', 'flatExpenses',
  'exportPohoda', 'exportMoneyS3', 'exportOmega', 'exportCsv', 'exportWeBudgetCsv',
  'importIdoklad', 'importSuperfaktura', 'importKros', 'importPohoda', 'importCsv', 'importTimeTracker',
  'extractInvoiceFields', 'parseEkasaQr', 'stockLevels', 'movesForDocument', 'averageCost',
  'normalizeStockMove', 'moveDeltas', 'companyDelta', 'sortStockMoves', 'stockOnHand', 'levelsByItem', 'negativeStockWarnings',
  'lowStockItems', 'costStockMoves', 'stockValuation', 'reconcileDocumentMoves', 'documentsAffectedBy', 'deliveredByNote',
  'stockReservations', 'availableStock', 'priceFor', 'inventoryDifferences', 'hasShortage', 'salesReceiptSeries', 'salesReceiptLine',
  'issueSalesReceipt', 'vrpSummary', 'stockCsv',
  'salesReport', 'agingReport', 'cashflowForecast', 'searchIndex', 'ekasaReceiptText',
  'uuidv7', 'isValidIco', 'isValidDic', 'isValidVatId', 'isValidIban', 'bicFromIban'
];

describe('core public API', () => {
  it.each(API)('exports %s', (name) => {
    expect(typeof core[name]).toBe('function');
  });

  it('exports the schema and the provider list', () => {
    expect(core.SCHEMA_VERSION).toBe(1);
    expect(core.schema.SCHEMAS.Document).toBeTruthy();
    expect(core.PEPPOL_PROVIDERS.map(p => p.id)).toEqual(expect.arrayContaining(['verteco', 'dativery', 'epostak', 'ipostar', 'sapi-sk']));
  });

  it('stubs throw NotImplementedError with a stable code', () => {
    try {
      core.computeTotals({ lines: [] });
      // Implemented by now: nothing to check here.
    } catch (e) {
      expect(e).toBeInstanceOf(core.NotImplementedError);
      expect(e.code).toBe('NOT_IMPLEMENTED');
    }
  });

  it('participantId builds the Slovak Peppol id', () => {
    expect(core.participantId('2020123456')).toBe('0245:2020123456');
  });
});
