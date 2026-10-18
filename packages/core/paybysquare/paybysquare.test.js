// PAY by square and QR Platba: the encoded code decodes back to the same
// IBAN, amount, symbols, date and message; the format choice follows the
// country of the account and the currency.
import { describe, it, expect } from 'vitest';
import {
  payBySquare, decodePayBySquare, qrPlatba, decodeQrPlatba, paymentQr, paymentQrFormat, QR_FORMATS
} from './index.js';

const SK_IBAN = 'SK3112000000198742637541';
const CZ_IBAN = 'CZ6508000000192000145399';

const payment = {
  iban: SK_IBAN,
  bic: 'UNCRSKBX',
  amount: '1234.56',
  currency: 'EUR',
  vs: '2026001',
  ks: '0308',
  ss: '42',
  dueDate: '2026-11-01',
  note: 'Faktura 2026001, dakujeme',
  beneficiary: 'Biela orlica s. r. o.',
  invoiceId: '2026001'
};

describe('PAY by square', () => {
  it('round-trips IBAN, amount, symbols, date and message', () => {
    const text = payBySquare(payment);
    expect(text).toMatch(/^[0-9A-V]+$/);
    const back = decodePayBySquare(text);
    expect(back).toMatchObject({
      iban: SK_IBAN, bic: 'UNCRSKBX', amount: '1234.56', currency: 'EUR',
      vs: '2026001', ks: '0308', ss: '42', dueDate: '2026-11-01', note: 'Faktura 2026001, dakujeme',
      invoiceId: '2026001'
    });
    expect(back.beneficiary).toBe('Biela orlica s. r. o.');
  });

  it('keeps whole amounts and amounts with one decimal place exact', () => {
    expect(decodePayBySquare(payBySquare({ ...payment, amount: '100' })).amount).toBe('100.00');
    expect(decodePayBySquare(payBySquare({ ...payment, amount: '0.1' })).amount).toBe('0.10');
    expect(decodePayBySquare(payBySquare({ ...payment, amount: '9999999999.99' })).amount).toBe('9999999999.99');
  });

  it('works without the optional fields', () => {
    const back = decodePayBySquare(payBySquare({ iban: ' sk31 1200 0000 1987 4263 7541 ', amount: '5', currency: 'EUR' }));
    expect(back.iban).toBe(SK_IBAN);
    expect(back.amount).toBe('5.00');
    expect(back.vs).toBeNull();
    expect(back.dueDate).toBeNull();
  });

  it('strips diacritics from the note so every bank reads it', () => {
    const back = decodePayBySquare(payBySquare({ ...payment, note: 'Platba za tovar, ďakujeme' }));
    expect(back.note).toBe('Platba za tovar, dakujeme');
  });

  it('refuses amounts with more than two places, bad symbols and bad dates', () => {
    expect(() => payBySquare({ ...payment, amount: '1.234' })).toThrow(expect.objectContaining({ code: 'QR_INVALID_AMOUNT' }));
    expect(() => payBySquare({ ...payment, amount: '-5' })).toThrow(expect.objectContaining({ code: 'QR_INVALID_AMOUNT' }));
    expect(() => payBySquare({ ...payment, vs: '12345678901' })).toThrow(expect.objectContaining({ code: 'QR_INVALID_SYMBOL' }));
    expect(() => payBySquare({ ...payment, dueDate: '01.11.2026' })).toThrow(expect.objectContaining({ code: 'QR_INVALID_DATE' }));
    expect(() => payBySquare({ ...payment, iban: '' })).toThrow(expect.objectContaining({ code: 'QR_MISSING_IBAN' }));
    expect(() => payBySquare({ ...payment, iban: 'SK0000' })).toThrow(expect.objectContaining({ code: 'QR_ENCODE_FAILED' }));
  });

  it('reports a code that is not PAY by square', () => {
    expect(() => decodePayBySquare('hello world')).toThrow(expect.objectContaining({ code: 'QR_DECODE_FAILED' }));
  });
});

describe('QR Platba', () => {
  it('builds and parses the SPD string', () => {
    const text = qrPlatba({ ...payment, iban: CZ_IBAN, bic: 'GIBACZPX', currency: 'CZK', note: 'Faktura 2026001' });
    expect(text).toBe(`SPD*1.0*ACC:${CZ_IBAN}+GIBACZPX*AM:1234.56*CC:CZK*DT:20261101*X-VS:2026001*X-KS:0308*X-SS:42*MSG:Faktura 2026001*RN:Biela orlica s. r. o.`);
    expect(decodeQrPlatba(text)).toMatchObject({
      iban: CZ_IBAN, bic: 'GIBACZPX', amount: '1234.56', currency: 'CZK', vs: '2026001', ks: '0308', ss: '42',
      dueDate: '2026-11-01', note: 'Faktura 2026001', beneficiary: 'Biela orlica s. r. o.'
    });
  });

  it('strips diacritics and the separator from texts', () => {
    const text = qrPlatba({ iban: CZ_IBAN, amount: '10', currency: 'CZK', note: 'Příliš * žluťoučký', beneficiary: 'Žlutá s.r.o.' });
    expect(text).toContain('MSG:Prilis zlutoucky');
    expect(text).toContain('RN:Zluta s.r.o.');
  });

  it('refuses a string that is not SPD', () => {
    expect(() => decodeQrPlatba('SPC*1.0*ACC:CZ')).toThrow(expect.objectContaining({ code: 'QR_DECODE_FAILED' }));
  });
});

describe('format choice', () => {
  it('uses PAY by square for EUR on SK and CZ accounts and QR Platba for CZK on CZ accounts', () => {
    expect(paymentQrFormat({ iban: SK_IBAN, amount: '1', currency: 'EUR' })).toBe(QR_FORMATS.PAY_BY_SQUARE);
    expect(paymentQrFormat({ iban: CZ_IBAN, amount: '1', currency: 'EUR' })).toBe(QR_FORMATS.PAY_BY_SQUARE);
    expect(paymentQrFormat({ iban: CZ_IBAN, amount: '1', currency: 'CZK' })).toBe(QR_FORMATS.QR_PLATBA);
    expect(paymentQrFormat({ iban: SK_IBAN, amount: '1', currency: 'CZK' })).toBe(QR_FORMATS.PAY_BY_SQUARE);
  });

  it('gives no code for a zero amount, a missing account or other countries', () => {
    expect(paymentQrFormat({ iban: SK_IBAN, amount: '0.00', currency: 'EUR' })).toBeNull();
    expect(paymentQrFormat({ iban: '', amount: '1', currency: 'EUR' })).toBeNull();
    expect(paymentQrFormat({ iban: 'DE89370400440532013000', amount: '1', currency: 'EUR' })).toBeNull();
    expect(paymentQr({ iban: SK_IBAN, amount: '0', currency: 'EUR' })).toBeNull();
  });

  it('paymentQr returns the format with the text', () => {
    const qr = paymentQr({ iban: CZ_IBAN, amount: '250', currency: 'CZK', vs: '1' });
    expect(qr.format).toBe(QR_FORMATS.QR_PLATBA);
    expect(qr.text.startsWith('SPD*1.0*')).toBe(true);
    expect(paymentQr({ iban: SK_IBAN, amount: '250', currency: 'EUR', beneficiary: 'X' }).format).toBe(QR_FORMATS.PAY_BY_SQUARE);
  });
});
