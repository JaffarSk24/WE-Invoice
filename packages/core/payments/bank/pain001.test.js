// SEPA pain.001.001.03: the batch is checked before writing, texts fit the
// SEPA character set, the symbols reach the end-to-end id, and the file
// validates against the official ISO 20022 schema (with xmllint, which CI
// runners and most developer machines have; without it the structural
// checks still run).
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPain001, validatePain001, sepaText, paymentsForReceived } from './index.js';
import { endToEndId } from './pain001.js';
import { parseXml, all, textAt } from './xml/read.js';

const XSD = fileURLToPath(new URL('../../../../tests/fixtures/bank/xsd/pain.001.001.03.xsd', import.meta.url));
const hasXmllint = (() => {
  try { execFileSync('xmllint', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
})();

const DEBTOR = { name: 'Vzorová firma s.r.o.', iban: 'SK3911000000002900123456' };
const PAYMENTS = [
  { creditorName: 'Dodávateľ s.r.o.', creditorIban: 'SK85 8330 0000 0055 6677 8899', amount: '369.00', vs: '2026555', ks: '0308', message: 'Faktúra PF2026555' },
  { creditorName: 'Gama & syn', creditorIban: 'CZ6508000000192000145399', creditorBic: 'GIBACZPX', amount: '12.5', executionDate: '2026-10-20' }
];
const OPTIONS = { messageId: 'BATCH-1', createdAt: '2026-10-18T09:30:00.000Z', executionDate: '2026-10-19' };

function validateWithXsd(xml) {
  const dir = mkdtempSync(join(tmpdir(), 'pain001-'));
  try {
    const file = join(dir, 'batch.xml');
    writeFileSync(file, xml);
    execFileSync('xmllint', ['--noout', '--schema', XSD, file], { stdio: 'pipe' });
    return true;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('pain.001.001.03', () => {
  const xml = buildPain001(PAYMENTS, DEBTOR, OPTIONS);
  const doc = parseXml(xml);

  it.skipIf(!hasXmllint)('validates against the ISO 20022 schema', () => {
    expect(validateWithXsd(xml)).toBe(true);
    expect(validateWithXsd(buildPain001(PAYMENTS.slice(0, 1), { ...DEBTOR, bic: 'TATRSKBX' }, OPTIONS))).toBe(true);
  });

  it('writes the group header with count and control sum', () => {
    expect(doc.attrs.xmlns).toBe('urn:iso:std:iso:20022:tech:xsd:pain.001.001.03');
    expect(textAt(doc, 'CstmrCdtTrfInitn/GrpHdr/MsgId')).toBe('BATCH-1');
    expect(textAt(doc, 'CstmrCdtTrfInitn/GrpHdr/CreDtTm')).toBe('2026-10-18T09:30:00');
    expect(textAt(doc, 'CstmrCdtTrfInitn/GrpHdr/NbOfTxs')).toBe('2');
    expect(textAt(doc, 'CstmrCdtTrfInitn/GrpHdr/CtrlSum')).toBe('381.50');
  });

  it('makes one payment block per execution date', () => {
    const blocks = all(doc, 'CstmrCdtTrfInitn/PmtInf');
    expect(blocks.map(b => textAt(b, 'ReqdExctnDt'))).toEqual(['2026-10-19', '2026-10-20']);
    expect(textAt(blocks[0], 'DbtrAgt/FinInstnId/BIC')).toBe('TATRSKBX');
    expect(textAt(blocks[0], 'ChrgBr')).toBe('SLEV');
  });

  it('fills the transaction: symbols, amount, creditor agent, SEPA text', () => {
    const [first] = all(doc, 'CstmrCdtTrfInitn/PmtInf/CdtTrfTxInf');
    expect(textAt(first, 'PmtId/EndToEndId')).toBe('/VS2026555/SS/KS0308');
    expect(textAt(first, 'Amt/InstdAmt')).toBe('369.00');
    expect(textAt(first, 'CdtrAgt/FinInstnId/BIC')).toBe('FIOZSKBA');
    expect(textAt(first, 'Cdtr/Nm')).toBe('Dodavatel s.r.o.');
    expect(textAt(first, 'CdtrAcct/Id/IBAN')).toBe('SK8583300000005566778899');
    expect(textAt(first, 'RmtInf/Ustrd')).toBe('Faktura PF2026555');
    const [second] = all(doc, 'CstmrCdtTrfInitn/PmtInf').slice(1).flatMap(b => all(b, 'CdtTrfTxInf'));
    expect(textAt(second, 'PmtId/EndToEndId')).toBe('NOTPROVIDED');
    expect(textAt(second, 'Cdtr/Nm')).toBe('Gama syn');
  });

  it('refuses a batch with problems and lists them all', () => {
    const bad = [
      { creditorName: '', creditorIban: 'SK0000000000000000000000', amount: '-1' },
      { creditorName: 'X', creditorIban: 'SK8583300000005566778899', creditorBic: 'bad', amount: '1.234', currency: 'CZK' }
    ];
    const problems = validatePain001(bad, { name: 'A', iban: 'nope' });
    expect(problems).toEqual(expect.arrayContaining([
      { index: -1, field: 'iban', code: 'IBAN_INVALID' },
      { index: 0, field: 'creditorIban', code: 'IBAN_INVALID' },
      { index: 0, field: 'creditorName', code: 'NAME_MISSING' },
      { index: 0, field: 'amount', code: 'AMOUNT_INVALID' },
      { index: 1, field: 'creditorBic', code: 'BIC_INVALID' },
      { index: 1, field: 'currency', code: 'SEPA_EUR_ONLY' },
      { index: 1, field: 'amount', code: 'AMOUNT_INVALID' }
    ]));
    expect(() => buildPain001(bad, DEBTOR)).toThrow(expect.objectContaining({ code: 'PAIN001_INVALID' }));
    expect(validatePain001([], DEBTOR)).toEqual([{ index: -1, field: 'payments', code: 'PAYMENTS_EMPTY' }]);
  });

  it('keeps texts in the SEPA character set and length', () => {
    expect(sepaText('Žltý kôň & spol. <x> "q"', 70)).toBe('Zlty kon spol. x q');
    expect(sepaText('a'.repeat(200), 140)).toHaveLength(140);
    expect(endToEndId({ vs: '0012', ss: '9' })).toBe('/VS12/SS9/KS');
  });
});

describe('received invoices to pay', () => {
  const contacts = [{ id: 'c1', name: 'Dodávateľ s.r.o.', iban: 'SK8583300000005566778899' }];
  const base = { kind: 'RECEIVED_INVOICE', status: 'PROCESSED', currency: 'EUR', lines: [], payments: [], contactId: 'c1' };
  const docs = [
    { ...base, id: 'r1', number: 'PF1', vs: '111', totals: { net: '100', vat: '0', gross: '100', payable: '100.00' }, payments: [{ id: 'p', date: '2026-10-01', amount: '40.00', method: 'TRANSFER', source: 'MANUAL' }] },
    { ...base, id: 'r2', number: 'PF2', contactId: null, seller: { name: 'Bez uctu' }, totals: { net: '5', vat: '0', gross: '5', payable: '5.00' } },
    { ...base, id: 'r3', number: 'PF3', currency: 'CZK', totals: { net: '5', vat: '0', gross: '5', payable: '5.00' } },
    { ...base, id: 'r4', number: 'PF4', status: 'PAID', totals: { net: '5', vat: '0', gross: '5', payable: '5.00' }, payments: [{ id: 'q', date: '2026-10-01', amount: '5.00', method: 'TRANSFER', source: 'MANUAL' }] },
    { ...base, id: 'i1', kind: 'INVOICE', status: 'ISSUED', totals: { net: '5', vat: '0', gross: '5', payable: '5.00' } }
  ];

  it('takes what is still open and tells why a document is left out', () => {
    const { payments, skipped } = paymentsForReceived(docs, contacts, { executionDate: '2026-10-19' });
    expect(payments).toEqual([expect.objectContaining({ docId: 'r1', amount: '60.00', creditorIban: 'SK8583300000005566778899', vs: '111', message: 'PF1', executionDate: '2026-10-19' })]);
    expect(skipped).toEqual([{ docId: 'r2', code: 'IBAN_MISSING' }, { docId: 'r3', code: 'SEPA_EUR_ONLY' }]);
    expect(() => buildPain001(payments, DEBTOR, OPTIONS)).not.toThrow();
  });
});
