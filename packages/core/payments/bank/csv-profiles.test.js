// Every CSV bank profile: detection from the header, the column mapping
// and the normalised transactions of a synthetic statement.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseBankStatement, BANK_PROFILES } from './index.js';
import { detectProfiles } from './csv/profiles.js';

const fixture = (name) => readFileSync(new URL(`../../../../tests/fixtures/bank/csv/${name}`, import.meta.url));

const SK_CASES = [
  ['tatra', 'tatra.csv'], ['slsp', 'slsp.csv'], ['vub', 'vub-windows-1250.csv'], ['csob-sk', 'csob-sk.csv'],
  ['365bank', '365bank.csv'], ['prima', 'prima.csv'], ['unicredit', 'unicredit.csv']
];

describe('Slovak bank CSV profiles', () => {
  it.each(SK_CASES)('%s is detected and read', (profile, file) => {
    const result = parseBankStatement(fixture(file));
    expect(result.format).toBe('CSV');
    expect(result.profile).toBe(profile);
    expect(result.transactions).toHaveLength(3);
    const [incoming, outgoing, third] = result.transactions;
    expect(incoming).toMatchObject({
      date: '2026-10-05', amount: '1230.00', currency: 'EUR', counterpartyName: 'Alfa s.r.o.',
      counterpartyIban: 'SK9709000000001234567891', vs: '20260001'
    });
    expect(outgoing).toMatchObject({ date: '2026-10-06', amount: '-369.00', vs: '2026555', counterpartyIban: 'SK8583300000005566778899' });
    expect(outgoing.counterpartyName).toMatch(/^Dod.vate. s\.r\.o\.$/);
    expect(third).toMatchObject({ amount: '615.00', vs: '20260002' });
  });

  it('reads the windows-1250 export of VUB with diacritics intact', () => {
    const result = parseBankStatement(fixture('vub-windows-1250.csv'));
    expect(result.encoding).toBe('windows-1250');
    expect(result.transactions[1].counterpartyName).toBe('Dodávateľ s.r.o.');
    expect(result.transactions[1].message).toBe('Úhrada');
  });

  it('takes the constant symbol from its column and the symbols of the payer reference', () => {
    const tatra = parseBankStatement(fixture('tatra.csv')).transactions;
    expect(tatra[0].ks).toBe('308');
    expect(tatra[2]).toMatchObject({ vs: '20260002', ks: '308', ss: null });
  });
});

describe('Czech bank CSV profiles', () => {
  it('fio: skips the preamble and builds IBANs from domestic numbers', () => {
    const result = parseBankStatement(fixture('fio.csv'));
    expect(result.profile).toBe('fio');
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]).toMatchObject({
      date: '2026-10-05', amount: '30750.00', currency: 'CZK', vs: '20260001', ks: '308',
      counterpartyAccount: '670100-2212345678', counterpartyIban: 'CZ1062106701002212345678', ref: '26100001'
    });
    expect(result.transactions[1]).toMatchObject({ amount: '-9225.50', counterpartyIban: 'CZ1801000000000123456789' });
  });

  it('mbank: headers with "#" and amounts with spaces', () => {
    const result = parseBankStatement(fixture('mbank.csv'), { currency: 'CZK' });
    expect(result.profile).toBe('mbank');
    expect(result.transactions.map(t => t.amount)).toEqual(['30750.00', '-9225.50']);
    expect(result.transactions[0]).toMatchObject({ date: '2026-10-05', vs: '20260001', currency: 'CZK', counterpartyIban: 'CZ6020100000002400123456' });
  });
});

describe('payment institution CSV profiles', () => {
  it('revolut business: completed rows only, fee kept apart', () => {
    const result = parseBankStatement(fixture('revolut-business.csv'));
    expect(result.profile).toBe('revolut-business');
    expect(result.pending).toBe(1);
    expect(result.warnings).toContain('BANK_ROWS_PENDING');
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]).toMatchObject({ amount: '1230.00', counterpartyName: 'Alfa s.r.o.', message: 'FA20260001' });
    expect(result.transactions[1]).toMatchObject({ amount: '-369.00', fee: '0.20', vs: '2026555', counterpartyIban: 'SK8583300000005566778899' });
  });

  it('wise: day-first dashed dates and the payer or payee name', () => {
    const result = parseBankStatement(fixture('wise.csv'));
    expect(result.profile).toBe('wise');
    expect(result.transactions[0]).toMatchObject({ date: '2026-10-05', amount: '1230.00', counterpartyName: 'Alfa s.r.o.', vs: '20260001' });
    expect(result.transactions[1]).toMatchObject({ date: '2026-10-06', counterpartyName: 'Dodavatel s.r.o.', vs: '2026555' });
  });
});

describe('profile detection', () => {
  it('lists every profile of the task', () => {
    expect(BANK_PROFILES.map(p => p.id)).toEqual([
      'tatra', 'slsp', 'vub', 'csob-sk', '365bank', 'prima', 'unicredit', 'fio', 'mbank', 'revolut-business', 'wise'
    ]);
  });

  it('falls back to the generic layout for an unknown header', () => {
    const result = parseBankStatement(fixture('generic.csv'));
    expect(result.profile).toBe('generic');
    expect(result.transactions[0]).toMatchObject({ date: '2026-10-05', amount: '1230.00', vs: '20260001', counterpartyIban: 'SK9709000000001234567891' });
  });

  it('a forced profile and a column override win over detection', () => {
    const text = 'A;B;C\n05.10.2026;12,50;x\n';
    expect(detectProfiles(['A', 'B', 'C'])).toEqual([]);
    const result = parseBankStatement(text, { profile: 'generic', mapping: { date: 0, amount: 1, message: 2 } });
    expect(result.transactions[0]).toMatchObject({ date: '2026-10-05', amount: '12.50', message: 'x' });
  });

  it('reports a file without date or amount columns', () => {
    const result = parseBankStatement('Foo;Bar\nx;y\n');
    expect(result.transactions).toEqual([]);
    expect(result.warnings).toContain('BANK_CSV_COLUMNS_MISSING');
  });
});
