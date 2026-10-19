// SEPA credit transfers as pain.001.001.03 (ISO 20022 CustomerCreditTransfer
// Initiation), the batch file a user uploads to internet banking to pay
// received invoices. Version 03 is the version Slovak and Czech banks have
// accepted for customer uploads since SEPA started; support for 09 varies
// by bank, so 03 is the safe choice (each bank's format guide is to be
// checked before release).
// Every payment is checked before anything is written: valid IBANs, BIC
// format, EUR, a positive amount with at most two places. Texts are
// reduced to the SEPA Latin character set; the Slovak payment symbols go
// to the end-to-end id as "/VS.../SS.../KS..." the way SK banks read them.
import { el, xmlDocument } from './xml/write.js';
import { compactIban, symbolDigits } from './text.js';
import { bicFromIban } from '../../ids/index.js';
import { add, cmp, round, isZero, isNegative } from '../../money/index.js';
import { CoreError } from '../../errors.js';

export const PAIN001_NAMESPACE = 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.03';
const BIC = /^[A-Z]{6}[A-Z2-9][A-NP-Z0-9]([A-Z0-9]{3})?$/;
const MAX_AMOUNT = '999999999.99';

/** Text in the SEPA character set (a-z A-Z 0-9 / - ? : ( ) . , ' + space), cut to `max`. */
export function sepaText(value, max) {
  const s = String(value ?? '')
    .normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/[^A-Za-z0-9/\-?:().,'+ ]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return s.slice(0, max).trim();
}

/** "/VS123/SS/KS0308" from the symbols, or null when there are none. */
export function endToEndId(payment) {
  const vs = symbolDigits(payment.vs);
  const ss = symbolDigits(payment.ss);
  const ks = symbolDigits(payment.ks, 4);
  if (!vs && !ss && !ks) return null;
  return `/VS${vs || ''}/SS${ss || ''}/KS${ks ? ks.padStart(4, '0') : ''}`;
}

/**
 * Problems of a batch, one per field: [{index, field, code}] where index
 * -1 is the debtor. An empty list means the batch can be written.
 */
export function validatePain001(payments, debtor) {
  const problems = [];
  if (!compactIban(debtor?.iban)) problems.push({ index: -1, field: 'iban', code: 'IBAN_INVALID' });
  if (debtor?.bic && !BIC.test(String(debtor.bic).toUpperCase())) problems.push({ index: -1, field: 'bic', code: 'BIC_INVALID' });
  if (!sepaText(debtor?.name, 70)) problems.push({ index: -1, field: 'name', code: 'NAME_MISSING' });
  if (!payments?.length) problems.push({ index: -1, field: 'payments', code: 'PAYMENTS_EMPTY' });
  (payments || []).forEach((p, index) => {
    if (!compactIban(p.creditorIban)) problems.push({ index, field: 'creditorIban', code: 'IBAN_INVALID' });
    if (p.creditorBic && !BIC.test(String(p.creditorBic).toUpperCase())) problems.push({ index, field: 'creditorBic', code: 'BIC_INVALID' });
    if (!sepaText(p.creditorName, 70)) problems.push({ index, field: 'creditorName', code: 'NAME_MISSING' });
    if ((p.currency || 'EUR') !== 'EUR') problems.push({ index, field: 'currency', code: 'SEPA_EUR_ONLY' });
    const amount = String(p.amount ?? '');
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || isZero(amount) || isNegative(amount) || cmp(amount, MAX_AMOUNT) > 0) {
      problems.push({ index, field: 'amount', code: 'AMOUNT_INVALID' });
    }
  });
  return problems;
}

const isoSeconds = (iso) => String(iso).slice(0, 19);

function transaction(p) {
  const iban = compactIban(p.creditorIban);
  const bic = (p.creditorBic && String(p.creditorBic).toUpperCase()) || bicFromIban(iban);
  const message = sepaText(p.message, 140);
  return el('CdtTrfTxInf', [
    el('PmtId', [el('EndToEndId', sepaText(p.endToEndId || endToEndId(p) || 'NOTPROVIDED', 35))]),
    el('Amt', [el('InstdAmt', round(p.amount, 2), { Ccy: 'EUR' })]),
    bic ? el('CdtrAgt', [el('FinInstnId', [el('BIC', bic)])]) : null,
    el('Cdtr', [el('Nm', sepaText(p.creditorName, 70))]),
    el('CdtrAcct', [el('Id', [el('IBAN', iban)])]),
    message ? el('RmtInf', [el('Ustrd', message)]) : null
  ]);
}

const total = (list) => round(list.reduce((s, p) => add(s, p.amount), '0'), 2);

/**
 * The pain.001.001.03 XML of a batch: one payment information block per
 * requested execution date.
 * @param {Array<{creditorName: string, creditorIban: string, creditorBic?: string, amount: string, currency?: string,
 *   vs?: string, ks?: string, ss?: string, message?: string, endToEndId?: string, executionDate?: string}>} payments
 * @param {{name: string, iban: string, bic?: string}} debtor
 * @param {{messageId?: string, createdAt?: string, executionDate?: string}} [options]
 * @returns {string}
 */
export function buildPain001(payments, debtor, options = {}) {
  const problems = validatePain001(payments, debtor);
  if (problems.length) throw new CoreError('PAIN001_INVALID', `${problems.length} problem(s) in the payment batch`, problems);
  const createdAt = options.createdAt || new Date().toISOString();
  const messageId = sepaText(options.messageId || `WEI-${createdAt.replace(/\D/g, '').slice(0, 14)}`, 35);
  const fallbackDate = options.executionDate || createdAt.slice(0, 10);
  const groups = new Map();
  payments.forEach(p => {
    const date = p.executionDate || fallbackDate;
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date).push(p);
  });
  const debtorIban = compactIban(debtor.iban);
  const debtorBic = (debtor.bic && String(debtor.bic).toUpperCase()) || bicFromIban(debtorIban);
  const blocks = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, list], i) => el('PmtInf', [
    el('PmtInfId', sepaText(`${messageId}-${i + 1}`, 35)),
    el('PmtMtd', 'TRF'),
    el('BtchBookg', 'true'),
    el('NbOfTxs', String(list.length)),
    el('CtrlSum', total(list)),
    el('PmtTpInf', [el('SvcLvl', [el('Cd', 'SEPA')])]),
    el('ReqdExctnDt', date),
    el('Dbtr', [el('Nm', sepaText(debtor.name, 70))]),
    el('DbtrAcct', [el('Id', [el('IBAN', debtorIban)]), el('Ccy', 'EUR')]),
    el('DbtrAgt', [el('FinInstnId', [debtorBic ? el('BIC', debtorBic) : el('Othr', [el('Id', 'NOTPROVIDED')])])]),
    el('ChrgBr', 'SLEV'),
    ...list.map(transaction)
  ]));
  const root = el('Document', [
    el('CstmrCdtTrfInitn', [
      el('GrpHdr', [
        el('MsgId', messageId),
        el('CreDtTm', isoSeconds(createdAt)),
        el('NbOfTxs', String(payments.length)),
        el('CtrlSum', total(payments)),
        el('InitgPty', [el('Nm', sepaText(debtor.name, 70))])
      ]),
      ...blocks
    ])
  ], { xmlns: PAIN001_NAMESPACE });
  return xmlDocument(root);
}
