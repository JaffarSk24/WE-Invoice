// The Excel 97-2003 reader: files written by LibreOffice and by xlwt
// (dates, formulas with cached results, a shared string table longer than
// one record, Slovak letters) and hand-built edge cases.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readXls, isXls, numberText } from './xls.js';
import { readCfb } from './cfb.js';
import { importKros } from './programs.js';
import { record, u16, u32, f64, latin, workbook, compoundFile } from '../../../tests/fixtures/imports/xls-builder.js';

const fixture = (name) => new Uint8Array(readFileSync(new URL(`../../../tests/fixtures/imports/${name}`, import.meta.url)));
const cell = (row, col) => [...u16(row), ...u16(col), ...u16(0)];

describe('xls files', () => {
  it('reads an address book saved by LibreOffice', () => {
    const book = readXls(fixture('kros-adresar.xls'));
    expect(book.sheets).toEqual(['kros-adresar']);
    expect(book.rows[0].slice(0, 4)).toEqual(['Názov', 'IČO', 'DIČ', 'IČ DPH']);
    expect(book.rows[1]).toEqual(['Dodávateľ, s. r. o.', '44556677', '2022000018', 'SK2022000018', 'Štúrova 1', 'Žilina', '010 01', 'Slovensko', 'faktury@example.sk', '+421 41 000 000', '30']);
  });

  it('reads dates, decimals and cached formula results', () => {
    const { sheets, rows } = readXls(fixture('kros-faktury.xls'));
    expect(sheets).toEqual(['Faktúry', 'Kontakty']);
    expect(rows[1]).toEqual(['KR2025001', '2025-11-03', '2025-11-17', 'Žltý kôň, s. r. o.', '44556677', '100', '23', '123', '123']);
    expect(rows[2].slice(5, 8)).toEqual(['1234.56', '283.95', '1518.51']);
    expect(rows[3].slice(5, 8)).toEqual(['0.1', '0', '0.1']);
    expect(rows[4][1]).toBe('TRUE');
  });

  it('reads a shared string table that goes on in CONTINUE records', () => {
    const { rows } = readXls(fixture('kros-faktury.xls'), { sheet: 'Kontakty' });
    expect(rows).toHaveLength(150);
    expect(rows[149][0]).toBe('Kontakt číslo 149 so zámerne dlhým názvom firmy na test, s. r. o. ľščťžýáíé');
  });

  it('feeds the KROS importer like any table', () => {
    const result = importKros([{ name: 'adresar.xls', rows: readXls(fixture('kros-adresar.xls')).rows }]);
    expect(result.contacts.map(c => c.ico)).toEqual(['44556677', '35757442']);
  });

  it('reads a string result of a formula from the STRING record', () => {
    const text = latin('textovy');
    const bytes = compoundFile({ Workbook: workbook([
      record(0x0006, [...cell(0, 0), 0, 0, 0, 0, 0, 0, 0xff, 0xff, 0, 0, 0, 0, 0, 0, 0, 0]),
      record(0x0207, [...u16(text.length), 0, ...text]),
      record(0x0203, [...cell(0, 1), ...f64(1234.5)]),
      record(0x027e, [...cell(0, 2), ...u32((1234 << 2) | 3)]),
      record(0x0204, [...cell(0, 3), ...u16(2), 1, 0x0d, 0x01, 0x7e, 0x01])
    ]) });
    expect(isXls(bytes)).toBe(true);
    expect(readXls(bytes).rows).toEqual([['textovy', '1234.5', '12.34', 'čž']]);
  });

  it('refuses Excel 95, a password and a damaged file without guessing', () => {
    expect(() => readXls(compoundFile({ Book: workbook([]) }))).toThrow(expect.objectContaining({ code: 'IMPORT_XLS_VERSION' }));
    expect(() => readXls(compoundFile({ Workbook: workbook([], { version: 0x0500 }) }))).toThrow(expect.objectContaining({ code: 'IMPORT_XLS_VERSION' }));
    expect(() => readXls(compoundFile({ Workbook: workbook([], { extraGlobals: [record(0x002f, [0, 0])] }) }))).toThrow(expect.objectContaining({ code: 'IMPORT_XLS_ENCRYPTED' }));
    const broken = fixture('kros-adresar.xls').slice(0, 1200);
    expect(() => readXls(broken)).toThrow(expect.objectContaining({ code: 'IMPORT_FILE_DAMAGED' }));
    expect(() => readCfb(new Uint8Array(600))).toThrow(expect.objectContaining({ code: 'IMPORT_FILE_DAMAGED' }));
  });

  it('writes numbers the way Excel shows them', () => {
    expect(numberText(0.1 + 0.2)).toBe('0.3');
    expect(numberText(1234.56)).toBe('1234.56');
    expect(numberText(-5)).toBe('-5');
    expect(numberText(1e-7)).toBe('0.0000001');
    expect(numberText(NaN)).toBe('');
  });
});
