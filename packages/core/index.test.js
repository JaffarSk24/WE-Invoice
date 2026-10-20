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
  'buildUbl', 'parseUbl', 'validateUblLocal', 'hasBlockingIssues', 'buildIsdoc', 'parseIsdoc', 'payBySquare', 'decodePayBySquare', 'qrPlatba',
  'vatRecords', 'buildKv', 'buildSv', 'buildVatReturn', 'registrationTurnover',
  'exportChecks', 'canExport', 'mergeProblems', 'closePeriod', 'openPeriod', 'canChangeInPeriod', 'isPeriodClosed', 'documentTaxPoint',
  'recordsDigest', 'filingEntry', 'filingStatus', 'suggestedFilingType', 'ossData', 'ossCsv', 'parseTaxPeriod', 'taxPeriodOf', 'filingDueDate',
  'entriesForPayment', 'cashJournal', 'depreciationPlan', 'flatExpenses', 'planEntrySync', 'yearClosing', 'flatSummary',
  'receivablesBook', 'payablesBook', 'tripAllowance', 'incomeExpenseStatement', 'assetsLiabilitiesStatement', 'ledgerCsv',
  'exportPohoda', 'exportMoneyS3', 'exportOmega', 'exportCsv', 'exportWeBudgetCsv',
  'importIdoklad', 'importSuperfaktura', 'importKros', 'importPohoda', 'importCsv', 'importTimeTracker',
  'extractInvoiceFields', 'parseEkasaQr', 'stockLevels', 'movesForDocument', 'averageCost',
  'normalizeStockMove', 'moveDeltas', 'companyDelta', 'sortStockMoves', 'stockOnHand', 'levelsByItem', 'negativeStockWarnings',
  'lowStockItems', 'costStockMoves', 'stockValuation', 'reconcileDocumentMoves', 'documentsAffectedBy', 'deliveredByNote',
  'documentMoveIds', 'stockReservations', 'availableStock', 'priceFor', 'inventoryDifferences', 'hasShortage', 'salesReceiptSeries', 'salesReceiptLine',
  'issueSalesReceipt', 'vrpSummary', 'stockCsv', 'salesReceiptVatChoices', 'salesReceiptVatChoiceOf', 'vatOfCategory', 'salesReceiptVat',
  'salesReceiptBuyerNeed', 'normalizeVatId', 'checkSalesReceiptBuyer', 'quickSaleKind',
  'salesReport', 'agingReport', 'cashflowForecast', 'searchIndex', 'ekasaReceiptText',
  'searchQuery', 'profitability', 'averagePurchasePrices', 'paymentDelays', 'recurringRuns', 'agingBucket', 'periodKey', 'periodKeys',
  'eurAmounts', 'partyOf', 'trashEntries', 'restoredRecord', 'purgedRecord', 'auditEntryFor', 'filterAudit', 'changedFields',
  'collectLabels', 'collectProjects', 'normalizeLabels', 'toCsv', 'decimalComma', 'fold',
  'uuidv7', 'isValidIco', 'isValidDic', 'isValidVatId', 'isValidIban', 'bicFromIban',
  'protectCell', 'weBudgetRows', 'selectExportDocuments', 'registerRows', 'lineRows', 'exportState', 'exportFingerprint',
  'exportedPatch', 'accountantFiles', 'accountantSummary', 'exportFileName', 'buildBackup', 'serializeBackup', 'backupChecksum',
  'buildZip', 'buildXlsx', 'encodeWindows1250', 'decodeWindows1250', 'pohodaAddressbook', 'documentUuid', 'importOmegaText',
  'importRows', 'readTimeTracker', 'timeTrackerClients', 'timeTrackerStatus', 'buildImportPlan', 'applyImportPlan',
  'importContactKey', 'importDocumentKey', 'importItemKey', 'continueSeries', 'guessMapping', 'guessEntity', 'importFields',
  'readCsv', 'decodeText', 'detectDelimiter', 'readXlsx', 'readZip', 'isZip', 'parseBackup', 'planRestore', 'createReport',
  'mergeReports', 'detectStatementFormat', 'withImportKeys', 'splitDuplicates', 'parseSymbols', 'ibanFromDomestic',
  'matchStatement', 'makePayment', 'addPayment', 'removePayments', 'applyMatch', 'unapplyMatch', 'statusAfterPayments',
  'validatePain001', 'sepaText', 'paymentsForReceived', 'creditorIbanOf', 'defaultCashSeries', 'bookVouchers', 'cashBalance',
  'cashBookRows', 'checkCashOut', 'cashKindForPayment', 'buildCashVoucher', 'cashDifference', 'cashLimitCheck',
  'isBusinessParty', 'cashBookCsv', 'offsetCandidates', 'planOffset', 'buildOffset', 'cancelOffset', 'ekasaNeeded', 'ekasaExempt',
  'ekasaManualEntry', 'listPayments', 'bankTxDirection', 'paymentCandidates', 'paymentParty', 'openPaymentAmount',
  'recognizeXml', 'detectXmlFormat', 'registerInboxParser', 'recognizeQr', 'detectQrFormat', 'recognizeEkasaReceipt',
  'recognizeFound', 'detectInboxFile', 'mergeRecognitions', 'draftFromRecognition', 'pickFieldValue', 'applyUserValue',
  'learnTemplate', 'applyTemplateRegions', 'findSupplierContact', 'expenseCategory', 'expenseCategoryOf', 'withExpenseCategory',
  'vatPeriodKey', 'vatDeductionPeriodOf', 'deductibleVat', 'receivedKvSections',
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
