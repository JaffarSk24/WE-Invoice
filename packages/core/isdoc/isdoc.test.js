// ISDOC 6.0.2: the writer against golden files (validated with xmllint
// against isdoc-invoice-6.0.2.xsd when the schema is given in ISDOC_XSD),
// the reader on a Czech supplier invoice, and the round trip.
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { company, documents } from '../../../tests/fixtures/exports/period.js';
import { buildIsdoc, documentUuid } from './build.js';
import { parseIsdoc } from './parse.js';
import { computeTotals } from '../vat/index.js';

const FIXTURES = new URL('../../../tests/fixtures/isdoc/', import.meta.url);
const fixture = (name) => readFileSync(new URL(name, FIXTURES), 'utf8');
const ctx = { company, documents };
const XSD = process.env.ISDOC_XSD;

describe('buildIsdoc', () => {
  it.each([[0, 'invoice-eur'], [1, 'credit-note'], [2, 'invoice-czk-reverse-charge']])('document %i matches %s.isdoc', (i, name) => {
    expect(buildIsdoc(documents[i], ctx)).toBe(fixture(`${name}.isdoc`));
  });

  it('names the corrected invoice on a credit note', () => {
    expect(buildIsdoc(documents[1], ctx)).toMatch(/<OriginalDocumentReference>\s*<ID>FA2026001<\/ID>\s*<IssueDate>2026-09-02<\/IssueDate>/);
  });

  it('pays to the domestic account with the symbols', () => {
    const xml = buildIsdoc(documents[0], ctx);
    expect(xml).toContain('<IBAN>SK3112000000198742637541</IBAN>');
    expect(xml).toContain('<BankCode>1200</BankCode>');
    expect(xml).toContain('<VariableSymbol>2026001</VariableSymbol>');
  });

  it('refuses kinds without an ISDOC type and documents without a number', () => {
    expect(() => buildIsdoc({ ...documents[0], kind: 'QUOTE' }, ctx)).toThrow(expect.objectContaining({ code: 'ISDOC_KIND_UNSUPPORTED' }));
    expect(() => buildIsdoc({ ...documents[0], number: null }, ctx)).toThrow(expect.objectContaining({ code: 'ISDOC_NUMBER_REQUIRED' }));
  });

  it('derives a stable UUID when the id is not one', () => {
    const uuid = documentUuid({ id: 'demo-doc-1' });
    expect(uuid).toMatch(/^[0-9A-F]{8}-[0-9A-F]{4}-5[0-9A-F]{3}-A[0-9A-F]{3}-[0-9A-F]{12}$/);
    expect(documentUuid({ id: 'demo-doc-1' })).toBe(uuid);
    expect(documentUuid({ id: 'demo-doc-2' })).not.toBe(uuid);
  });

  it.skipIf(!XSD || !existsSync(XSD))('validates against the ISDOC 6.0.2 schema', () => {
    const dir = mkdtempSync(join(tmpdir(), 'isdoc-'));
    documents.filter(d => d.status !== 'DRAFT').forEach((d, i) => {
      const file = join(dir, `${i}.isdoc`);
      writeFileSync(file, buildIsdoc(d, ctx));
      execFileSync('xmllint', ['--noout', '--schema', XSD, file], { stdio: 'pipe' });
    });
  });
});

describe('parseIsdoc', () => {
  it('reads a Czech supplier invoice into a received invoice', () => {
    const { document, warnings, references } = parseIsdoc(fixture('supplier-cz.isdoc'));
    expect(warnings).toEqual([]);
    expect(references.corrects).toBeNull();
    expect(document).toMatchObject({
      kind: 'RECEIVED_INVOICE', number: '2026-0042', status: 'TO_PROCESS', issueDate: '2026-09-10', taxDate: '2026-09-09', dueDate: '2026-09-24',
      currency: 'CZK', fxRate: null, vs: '20260042', paymentMethod: 'TRANSFER', supplierIban: 'CZ6508000000192000145399'
    });
    expect(document.seller).toMatchObject({ name: 'Dodavatel Brno s.r.o.', ico: '27082440', dic: 'CZ27082440', icDph: 'CZ27082440', address: { street: 'Masarykova 5', city: 'Brno', zip: '602 00', country: 'CZ' } });
    expect(document.lines.map(l => [l.name, l.description, l.qty, l.unitPrice, l.vatCategory, l.vatRate, l.unit.code])).toEqual([
      ['Kancelářská židle', 'Šedá barva', '4', '500.00', 'S', '21', 'H87'],
      ['Doprava', '', '1', '300.00', 'S', '21', 'C62']
    ]);
    expect(computeTotals(document).payable).toBe('2783.00');
  });

  it('round-trips our own documents with the same totals', () => {
    documents.slice(0, 3).forEach(d => {
      const { document, warnings } = parseIsdoc(buildIsdoc(d, ctx), { direction: 'OUT' });
      expect(warnings).toEqual([]);
      expect(document.kind).toBe(d.kind);
      expect(document.number).toBe(d.number);
      expect(document.currency).toBe(d.currency);
      expect(computeTotals(document).payable).toBe(computeTotals(d).payable);
    });
  });

  it('keeps the line discount', () => {
    const { document } = parseIsdoc(buildIsdoc(documents[0], ctx), { direction: 'OUT' });
    expect(document.lines[1]).toMatchObject({ unitPrice: '20.00', discountPct: '10' });
  });

  it('warns when the stated payable amount does not match the lines', () => {
    const xml = fixture('supplier-cz.isdoc').replace('<PayableAmount>2783.00</PayableAmount>', '<PayableAmount>2790.00</PayableAmount>');
    expect(parseIsdoc(xml).warnings).toContain('TOTALS_MISMATCH');
  });

  it('refuses a file that is not an ISDOC invoice', () => {
    expect(() => parseIsdoc('<Order/>')).toThrow(expect.objectContaining({ code: 'ISDOC_INVALID' }));
    expect(() => parseIsdoc('<Invoice><ID>1</Invoice>')).toThrow(expect.objectContaining({ code: 'IMPORT_XML_INVALID' }));
  });
});
