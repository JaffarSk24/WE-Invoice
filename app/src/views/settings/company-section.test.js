// Company settings rules, document defaults checks and series removal.
import { describe, it, expect } from 'vitest';
import { companyErrors, normalizeCompany, bankAccountFrom, withAccount, imageError } from './company-section-rules.js';
import { dueDaysError, fileMaskError } from './documents-section.js';
import { withoutSeries } from './numbering-section.js';

const valid = { name: 'Alfa', ico: '12 345 679', dic: '2020000004', icDph: 'sk2020000004', country: 'sk', vatMode: 'PAYER', email: 'a@b.sk' };

describe('company form', () => {
  it('normalises identifiers and the address', () => {
    expect(normalizeCompany({ ...valid, street: ' Hlavná 1 ' })).toMatchObject({ ico: '12345679', icDph: 'SK2020000004', address: { street: 'Hlavná 1', country: 'SK' } });
  });

  it('checks IČO, DIČ, IČ DPH, country and e-mail', () => {
    expect(companyErrors(valid)).toEqual({});
    expect(companyErrors({ ...valid, name: ' ', ico: '12345678', dic: '123', icDph: 'X1', email: 'x' })).toEqual({
      name: 'documents.company.errors.name', ico: 'documents.company.errors.ico', dic: 'documents.company.errors.dic',
      icDph: 'documents.company.errors.icDph', email: 'documents.company.errors.email'
    });
    expect(companyErrors({ ...valid, country: 'Slovensko' }).country).toBe('documents.company.errors.country');
    expect(companyErrors({ ...valid, icDph: '' }).icDph).toBe('documents.company.errors.icDphRequired');
    expect(companyErrors({ ...valid, icDph: '', vatMode: 'NONPAYER' })).toEqual({});
  });

  it('checks bank accounts and keeps one default per currency', () => {
    expect(bankAccountFrom({ id: 'a', iban: 'SK31 1200 0000 1987 4263 7541', currency: 'eur' }).account).toMatchObject({ iban: 'SK3112000000198742637541', currency: 'EUR' });
    expect(bankAccountFrom({ id: 'a', iban: 'SK00 1200' }).error).toBe('documents.company.errors.iban');
    expect(bankAccountFrom({ id: 'a', iban: 'SK3112000000198742637541', bic: 'X' }).error).toBe('documents.company.errors.bic');
    const first = withAccount([], { id: 'a', currency: 'EUR', isDefault: false });
    expect(first[0].isDefault).toBe(true);
    const two = withAccount(first, { id: 'b', currency: 'EUR', isDefault: true });
    expect(two.map(a => [a.id, a.isDefault])).toEqual([['a', false], ['b', true]]);
    expect(withAccount(two, { id: 'c', currency: 'CZK', isDefault: false }).find(a => a.id === 'c').isDefault).toBe(true);
  });

  it('accepts PNG and JPEG images up to the limit', () => {
    expect(imageError({ type: 'image/png', size: 1000 })).toBeNull();
    expect(imageError({ type: 'image/gif', size: 1000 })).toBe('documents.company.errors.imageType');
    expect(imageError({ type: 'image/png', size: 10 * 1024 * 1024 })).toBe('documents.company.errors.imageSize');
  });
});

describe('document defaults and series', () => {
  it('checks due days and the file name mask', () => {
    expect(dueDaysError('14')).toBeNull();
    expect(dueDaysError('-1')).toBe('documents.settings.errors.dueDays');
    expect(dueDaysError('4000')).toBe('documents.settings.errors.dueDays');
    expect(fileMaskError('{kind}_{number}')).toBeNull();
    expect(fileMaskError('{foo}')).toBe('documents.settings.errors.fileMask');
    expect(fileMaskError(' ')).toBe('documents.settings.errors.fileMask');
  });

  it('removes a series only when no document uses it', () => {
    const company = { series: [{ id: 's1' }, { id: 's2' }] };
    expect(withoutSeries(company, 's1', [{ seriesId: 's1' }])).toBeNull();
    expect(withoutSeries(company, 's1', [{ seriesId: 's1', deleted: true }])).toEqual([{ id: 's2' }]);
  });
});
