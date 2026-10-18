// Errors of the store and the sync, with the stable codes the interface
// translates (errors.<CODE> in the sync dictionary).
import { CoreError } from '@we-invoice/core';

export class StoreError extends CoreError {
  constructor(code, message, details) {
    super(code, message, details);
    this.name = 'StoreError';
  }
}

export const CODES = Object.freeze({
  READ_ONLY: 'READ_ONLY',
  DATA_DAMAGED: 'DATA_DAMAGED',
  NO_COMPANY: 'NO_COMPANY',
  NOT_FOUND: 'NOT_FOUND',
  UNKNOWN_COLLECTION: 'UNKNOWN_COLLECTION',
  LOCKED: 'LOCKED',
  WRONG_PASSWORD: 'WRONG_PASSWORD',
  WRONG_RECOVERY_KEY: 'WRONG_RECOVERY_KEY',
  WEAK_PASSWORD: 'WEAK_PASSWORD',
  NEWER_FORMAT: 'NEWER_FORMAT',
  SIGN_IN_FAILED: 'SIGN_IN_FAILED',
  SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
  DRIVE_SCOPE_MISSING: 'DRIVE_SCOPE_MISSING',
  NOT_SIGNED_IN: 'NOT_SIGNED_IN',
  RENEW_NEEDED: 'RENEW_NEEDED',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  SYNC_FAILED: 'SYNC_FAILED'
});

export function storeError(code, message, details) {
  return new StoreError(code, message || code, details);
}
