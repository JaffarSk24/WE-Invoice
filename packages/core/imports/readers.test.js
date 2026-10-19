// The readers under the importers: values, CSV, XML (including what it
// must refuse) and the column mapping.
import { describe, it, expect } from 'vitest';
import { readDate, readAmount, readIco, readCountry, readRate } from './values.js';
import { parseCsv, detectDelimiter, decodeText, readCsv } from './csv.js';
import { parseXml, textAt, descendants } from './xml.js';
import { guessMapping, guessEntity } from './mapping.js';
import { encodeWindows1250 } from '../exports/encoding.js';

describe('values', () => {
  it.each([
    ['2026-09-01', '2026-09-01'], ['1.9.2026', '2026-09-01'], ['01. 09. 2026', '2026-09-01'], ['01/09/2026', '2026-09-01'],
    ['2026-09-01T10:00:00', '2026-09-01'], ['31.2.2026', null], ['2026', null], ['', null]
  ])('reads the date %s', (input, expected) => expect(readDate(input)).toBe(expected));

  it('reads amounts and rates with either separator', () => {
    expect(readAmount('1 234,50')).toBe('1234.5');
    expect(readAmount('-12.30')).toBe('-12.3');
    expect(readAmount('\u221210,00')).toBe('-10');
    expect(readAmount('')).toBeNull();
    expect(readAmount('abc')).toBeNull();
    expect(readRate('23 %')).toBe('23');
    expect(readRate('19,00')).toBe('19');
    expect(readRate('5.5')).toBe('5.5');
  });

  it('reads identifiers and countries', () => {
    expect(readIco('36 421 928')).toBe('36421928');
    expect(readIco('')).toBeNull();
    expect(readCountry('Slovensko')).toBe('SK');
    expect(readCountry('Česká republika')).toBe('CZ');
    expect(readCountry('at')).toBe('AT');
    expect(readCountry('')).toBe('SK');
  });
});

describe('CSV reading', () => {
  it('detects the delimiter and keeps quoted delimiters and line breaks', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectDelimiter('a,b\n1,2')).toBe(',');
    expect(detectDelimiter('a\tb\n1\t2')).toBe('\t');
    expect(parseCsv('a;"b;c"\r\n"x ""y""";"line\nbreak"\r\n\r\n', ';')).toEqual([['a', 'b;c'], ['x "y"', 'line\nbreak']]);
    expect(readCsv('\ufeffa,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('decodes windows-1250 files', () => {
    const bytes = encodeWindows1250('Názov;Mesto\nŽltý kôň;Žilina').bytes;
    expect(decodeText(bytes)).toEqual({ text: 'Názov;Mesto\nŽltý kôň;Žilina', encoding: 'windows-1250' });
    expect(decodeText(new TextEncoder().encode('\ufeffčaj')).text).toBe('čaj');
  });
});

describe('XML reading', () => {
  it('reads prefixed names, attributes, entities and CDATA', () => {
    const root = parseXml('<?xml version="1.0"?><!-- c --><a:root xmlns:a="x" n="1 &amp; 2"><a:b>A &lt; B &#x10D;</a:b><c><![CDATA[<raw>]]></c><d/></a:root>');
    expect(root).toMatchObject({ name: 'root', qname: 'a:root', attrs: { n: '1 & 2' } });
    expect(textAt(root, 'b')).toBe('A < B č');
    expect(textAt(root, 'c')).toBe('<raw>');
    expect(textAt(root, 'd')).toBeNull();
    expect(descendants(root, 'b')).toHaveLength(1);
  });

  it('never resolves entities declared in a DOCTYPE', () => {
    const root = parseXml('<!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]><r>&x;</r>');
    expect(root.text).toBe('&x;');
  });

  it.each(['', '<a>', '<a></b>', '<a/><b/>', '<a><!-- x</a>'])('refuses broken XML %j', (xml) => {
    expect(() => parseXml(xml)).toThrow(expect.objectContaining({ code: 'IMPORT_XML_INVALID' }));
  });
});

describe('column mapping', () => {
  it('guesses document columns from Slovak and Czech headers', () => {
    const header = ['Číslo dokladu', 'Datum vystavení', 'DUZP', 'Odběratel', 'IČ', 'Celkem bez DPH', 'DPH', 'Celkem s DPH'];
    expect(guessEntity(header)).toBe('documents');
    expect(guessMapping(header, 'documents')).toEqual({ number: 0, issueDate: 1, taxDate: 2, partner: 3, ico: 4, net: 5, vat: 6, gross: 7 });
  });

  it('tells contacts from price list items', () => {
    expect(guessEntity(['Názov', 'IČO', 'DIČ', 'Mesto'])).toBe('contacts');
    expect(guessEntity(['Názov', 'Kód', 'MJ', 'Cena', 'DPH'])).toBe('items');
  });

  it('uses each column once', () => {
    const mapping = guessMapping(['Názov', 'Názov'], 'contacts');
    expect(mapping).toEqual({ name: 0 });
  });
});
