// Identifier checks on synthetic numbers with correct checksums (no real
// companies or accounts).
import { describe, it, expect } from 'vitest';
import { isValidIco, isValidDic, isValidVatId, isValidIban, bicFromIban, bankNameFromIban } from './validate.js';

describe('isValidIco', () => {
  it.each(['36835587', '12345679', '44444443', '11111119', '99999994', '50000012', '00000124', '000124', '0000124'])('accepts %s', (ico) => {
    expect(isValidIco(ico)).toBe(true);
  });

  it.each(['36835588', '12345678', '44444444', '1234567', '123456789', 'abcdefgh', '', null, undefined, '3683558a'])('rejects %s', (ico) => {
    expect(isValidIco(ico)).toBe(false);
  });

  it('ignores spaces', () => {
    expect(isValidIco('36 835 587')).toBe(true);
  });
});

describe('isValidDic', () => {
  it.each(['2020123457', '1023456786', '9999999999', '2020000004'])('accepts %s', (dic) => {
    expect(isValidDic(dic)).toBe(true);
  });

  it.each(['2020123456', '0020123457', '202012345', '20201234570', 'SK2020123457', '', null])('rejects %s', (dic) => {
    expect(isValidDic(dic)).toBe(false);
  });
});

describe('isValidVatId', () => {
  it.each([
    'SK2020123457', 'sk 2020123457', 'CZ12345679', 'CZ123456789', 'CZ1234567890', 'ATU12345678', 'DE123456789',
    'BE0123456789', 'NL123456789B01', 'PL1234567890', 'HU12345678', 'IE1234567T', 'IE1234567WA', 'FR12123456789',
    'ESA1234567B', 'IT12345678901', 'XI123456789', 'EL123456789', 'RO12', 'LT123456789', 'LT123456789012', 'CY12345678L'
  ])('accepts %s', (id) => {
    expect(isValidVatId(id)).toBe(true);
  });

  it.each([
    'SK2020123456', 'SK202012345', 'CZ12345678', 'CZ1234567', 'AT12345678', 'DE12345678', 'NL123456789A01', 'GB123456789',
    'US123456789', '2020123457', '', null, 'SKX020123457', 'RO1', 'BE2123456789'
  ])('rejects %s', (id) => {
    expect(isValidVatId(id)).toBe(false);
  });
});

describe('isValidIban', () => {
  it.each([
    'SK2709000000001234567890', 'SK27 0900 0000 0012 3456 7890', 'sk2709000000001234567890',
    'CZ4701000000001234567890', 'CZ4320100000001112223334', 'DE89370400440532013000', 'AT611904300234573201'
  ])('accepts %s', (iban) => {
    expect(isValidIban(iban)).toBe(true);
  });

  it.each([
    'SK2709000000001234567891', 'SK270900000000123456789', 'SK27090000000012345678901', 'CZ4701000000001234567891',
    'XX2709000000001234567890', '', null, undefined, 'SK27', '2709000000001234567890', 'SK27090000000O1234567890'
  ])('rejects %s', (iban) => {
    expect(isValidIban(iban)).toBe(false);
  });

  it('accepts a country without a known length when the checksum holds', () => {
    expect(isValidIban('DE89370400440532013000')).toBe(true);
    expect(isValidIban('DE89 3704 0044 0532 0130 00')).toBe(true);
  });
});

describe('bicFromIban', () => {
  it('knows Slovak and Czech banks', () => {
    expect(bicFromIban('SK2709000000001234567890')).toBe('GIBASKBX');
    expect(bicFromIban('SK0811000000002345678901')).toBe('TATRSKBX');
    expect(bicFromIban('CZ4701000000001234567890')).toBe('KOMBCZPP');
    expect(bicFromIban('CZ43 2010 0000 0011 1222 3334')).toBe('FIOBCZPP');
    expect(bankNameFromIban('CZ4320100000001112223334')).toBe('Fio banka');
  });

  it('returns null for other countries, unknown codes and invalid IBANs', () => {
    expect(bicFromIban('DE89370400440532013000')).toBeNull();
    expect(bicFromIban('SK1799990000001234567890')).toBeNull();
    expect(bicFromIban('SK2709000000001234567891')).toBeNull();
    expect(bicFromIban('')).toBeNull();
    expect(bankNameFromIban('DE89370400440532013000')).toBeNull();
    expect(bankNameFromIban('nonsense')).toBeNull();
  });
});
