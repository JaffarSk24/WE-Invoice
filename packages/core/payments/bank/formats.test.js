// CAMT.053, MT940 and ABO/GPC statements, format detection, the value
// readers and the idempotent import keys.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseBankStatement, detectStatementFormat, withImportKeys, splitDuplicates, parseSymbols, ibanFromDomestic } from './index.js';
import { parseStatementDate, parseStatementAmount } from './values.js';
import { parseXml } from './xml/read.js';

const fixture = (name) => readFileSync(new URL(`../../../../tests/fixtures/bank/${name}`, import.meta.url), 'utf8');

describe('CAMT.053', () => {
  const result = parseBankStatement(fixture('camt053.xml'));

  it('reads the account, the balances and booked entries only', () => {
    expect(result.format).toBe('CAMT053');
    expect(result.account).toEqual({ iban: 'SK3911000000002900123456', currency: 'EUR' });
    expect(result.openingBalance).toEqual({ amount: '4000.00', date: '2026-10-04' });
    expect(result.closingBalance).toEqual({ amount: '5476.00', date: '2026-10-07' });
    expect(result.pending).toBe(1);
    expect(result.transactions).toHaveLength(4);
  });

  it('takes the counterparty by direction and the symbols from the end-to-end id', () => {
    const [credit, debit] = result.transactions;
    expect(credit).toMatchObject({
      date: '2026-10-05', amount: '1230.00', counterpartyName: 'Alfa s.r.o.', counterpartyIban: 'SK9709000000001234567891',
      vs: '20260001', ks: '308', message: 'Faktúra FA20260001', ref: 'TB-261005-0001'
    });
    expect(debit).toMatchObject({ amount: '-369.00', counterpartyName: 'Dodávateľ s.r.o.', vs: '2026555', message: 'PF2026555' });
  });

  it('splits a batch entry into its transaction details', () => {
    const [, , first, second] = result.transactions;
    expect(first).toMatchObject({ amount: '400.00', vs: '20260002', counterpartyName: 'Beta a.s.', ref: 'TB-261007-0003-1' });
    expect(second).toMatchObject({ amount: '215.00', counterpartyName: 'Gama & syn', message: 'FA20260003 <batch>', ref: 'TB-261007-0003-2' });
  });

  it('refuses a DOCTYPE and broken XML', () => {
    expect(() => parseXml('<!DOCTYPE x [<!ENTITY a "b">]><x/>')).toThrow(/DOCTYPE/);
    expect(() => parseXml('<a><b></a>')).toThrow();
    expect(() => parseBankStatement('<Document><Other/></Document>')).toThrow();
  });
});

describe('MT940', () => {
  const result = parseBankStatement(fixture('mt940.sta'));

  it('reads balances and every :61: line with its :86:', () => {
    expect(result.format).toBe('MT940');
    expect(result.account.iban).toBe('SK3911000000002900123456');
    expect(result.openingBalance).toEqual({ amount: '4000.00', date: '2026-10-04' });
    expect(result.closingBalance).toEqual({ amount: '5476.00', date: '2026-10-07' });
    expect(result.transactions.map(t => t.amount)).toEqual(['1230.00', '-369.00', '615.00']);
  });

  it('understands subfield, keyword and free-text :86:', () => {
    const [a, b, c] = result.transactions;
    expect(a).toMatchObject({ date: '2026-10-05', vs: '20260001', counterpartyName: 'Alfa s.r.o.', counterpartyIban: 'SK9709000000001234567891', message: 'Faktura FA20260001', ref: 'TB-261005-0001' });
    expect(b).toMatchObject({ counterpartyName: 'Dodavatel s.r.o.', counterpartyIban: 'SK8583300000005566778899', vs: '2026555', ref: 'TB-261006-0002' });
    expect(c).toMatchObject({ vs: '20260002', ks: '308', message: 'Beta a.s. platba VS: 20260002 KS 0308' });
  });

  it('reads a booking date across the new year', () => {
    const text = ':20:X\n:25:SK3911000000002900123456\n:60F:C261231EUR0,00\n:61:2601011231C10,00NTRFNONREF\n:86:x\n';
    expect(parseBankStatement(text).transactions[0]).toMatchObject({ date: '2025-12-31', valueDate: '2026-01-01' });
  });
});

describe('ABO / GPC', () => {
  const result = parseBankStatement(fixture('gpc.gpc'));

  it('reads the header balances and the transactions in hundredths', () => {
    expect(result.format).toBe('GPC');
    expect(result.account).toMatchObject({ domestic: '2400123456', currency: 'CZK' });
    expect(result.openingBalance).toEqual({ amount: '100000.00', date: '2026-10-04' });
    expect(result.closingBalance).toEqual({ amount: '121524.50', date: '2026-10-07' });
    expect(result.transactions).toHaveLength(2);
  });

  it('decodes direction, symbols, counter account and the message records', () => {
    const [credit, debit] = result.transactions;
    expect(credit).toMatchObject({
      date: '2026-10-05', amount: '30750.00', currency: 'CZK', vs: '20260001', ks: '308',
      counterpartyAccount: '670100-2212345678/6210', counterpartyIban: 'CZ1062106701002212345678', message: 'Faktura FA20260001'
    });
    expect(debit).toMatchObject({ amount: '-9225.50', vs: '2026555', counterpartyName: 'DODAVATEL CZ', message: 'Dodavatel CZ s.r.o.' });
  });
});

describe('format detection and values', () => {
  it('detects each format from the content', () => {
    expect(detectStatementFormat(fixture('camt053.xml'))).toBe('CAMT053');
    expect(detectStatementFormat(fixture('mt940.sta'))).toBe('MT940');
    expect(detectStatementFormat(fixture('gpc.gpc'))).toBe('GPC');
    expect(detectStatementFormat('Date;Amount\n')).toBe('CSV');
    expect(() => parseBankStatement('   ')).toThrow(expect.objectContaining({ code: 'BANK_STATEMENT_EMPTY' }));
  });

  it('reads dates in every statement order', () => {
    expect(parseStatementDate('5.10.2026')).toBe('2026-10-05');
    expect(parseStatementDate('05. 10. 2026')).toBe('2026-10-05');
    expect(parseStatementDate('2026-10-05T23:59:00+02:00')).toBe('2026-10-05');
    expect(parseStatementDate('10/05/2026', 'mdy')).toBe('2026-10-05');
    expect(parseStatementDate('20261005')).toBe('2026-10-05');
    expect(parseStatementDate('261005', 'ymd6')).toBe('2026-10-05');
    expect(parseStatementDate('051026', 'dmy6')).toBe('2026-10-05');
    expect(parseStatementDate('31.02.2026')).toBeNull();
  });

  it('reads amounts with signs, groups and brackets as decimal strings', () => {
    expect(parseStatementAmount('-1 234,56')).toBe('-1234.56');
    expect(parseStatementAmount('1.234,5')).toBe('1234.50');
    expect(parseStatementAmount('(12.50)')).toBe('-12.50');
    expect(parseStatementAmount('12,50-')).toBe('-12.50');
    expect(parseStatementAmount('\u22128.00 EUR')).toBe('-8.00');
    expect(parseStatementAmount('+0,10')).toBe('0.10');
    expect(parseStatementAmount('abc')).toBeNull();
  });

  it('reads payment symbols in all their shapes', () => {
    expect(parseSymbols('/VS0020260001/SS123/KS0308')).toEqual({ vs: '20260001', ks: '308', ss: '123' });
    expect(parseSymbols('Platba VS: 2026555, KS 0558')).toEqual({ vs: '2026555', ks: '558', ss: null });
    expect(parseSymbols('v.s. 77 s.s.88')).toEqual({ vs: '77', ks: null, ss: '88' });
    expect(parseSymbols('BANKS 12345')).toEqual({ vs: null, ks: null, ss: null });
  });

  it('builds IBANs from SK and CZ domestic numbers', () => {
    expect(ibanFromDomestic('CZ', '19-2000145399/0800')).toBe('CZ6508000000192000145399');
    expect(ibanFromDomestic('SK', '2900123456', '1100')).toBe('SK3911000000002900123456');
    expect(ibanFromDomestic('DE', '123/0100')).toBeNull();
    expect(ibanFromDomestic('SK', 'abc/1100')).toBeNull();
  });
});

describe('idempotent import', () => {
  const txs = parseBankStatement(fixture('camt053.xml')).transactions;

  it('gives every line a key of account, date, amount and reference', () => {
    const keyed = withImportKeys('acc-1', txs);
    expect(keyed[0].importKey).toBe('acc-1|2026-10-05|1230.00|TB-261005-0001');
    expect(new Set(keyed.map(t => t.importKey)).size).toBe(keyed.length);
    expect(keyed.every(t => t.accountId === 'acc-1')).toBe(true);
  });

  it('tells apart identical lines of one file and finds them again on a re-import', () => {
    const same = { date: '2026-10-05', amount: '-3.50', message: 'Coffee', ref: null };
    const keyed = withImportKeys('acc-1', [same, same]);
    expect(keyed[0].importKey).not.toBe(keyed[1].importKey);
    const again = withImportKeys('acc-1', [same, same, { ...same, amount: '-4.00' }]);
    const { fresh, duplicates } = splitDuplicates(again, keyed);
    expect(duplicates).toHaveLength(2);
    expect(fresh).toHaveLength(1);
  });

  it('a deleted record does not block a new import of its line', () => {
    const keyed = withImportKeys('acc-1', txs.slice(0, 1));
    expect(splitDuplicates(keyed, [{ ...keyed[0], deleted: true }]).fresh).toHaveLength(1);
  });
});

describe('CAMT.053 of Tatra banka', () => {
  it('keeps the narrative of its markup, names the shop of a card payment and skips zero lines', () => {
    const txs = parseBankStatement(fixture('camt053-tatra.xml')).transactions;
    expect(txs.map(t => [t.amount, t.counterpartyName, t.message])).toEqual([
      ['-36.90', 'Realna podpora s.r.o.', 'Sluzby uctovnictva'],
      ['-7.26', 'ISTORES.SK', 'POS nákup'],
      ['-1.60', null, 'Transakčná daň 05.10.2026']
    ]);
    expect(txs[0].vs).toBe('202601936');
  });
});
