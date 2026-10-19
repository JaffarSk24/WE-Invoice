// Snapshot tests of the docDefinition: the text layer and the structure
// of every template in every print language (and the bilingual mode),
// never bytes. Plus the rules of the content: QR, legal notes, VAT
// columns, bilingual labels, diacritics.
import { describe, it, expect } from 'vitest';
import { buildDocDefinition } from './doc-definition.js';
import { TEMPLATE_IDS } from './templates/index.js';
import * as fx from '../../../tests/fixtures/pdf/documents.js';

// Every text of a docDefinition in reading order, with a marker for the
// structure (tables, columns, images, QR codes).
export function textLayer(node, out = []) {
  if (node === null || node === undefined) return out;
  if (typeof node === 'string') { if (node.trim()) out.push(node); return out; }
  if (Array.isArray(node)) { node.forEach(n => textLayer(n, out)); return out; }
  if (typeof node !== 'object') return out;
  if (node.qr) { out.push(`[qr ${node.qr.slice(0, 12)}...]`); return out; }
  if (node.image) { out.push(`[image ${node.image}]`); return out; }
  if (node.table) { out.push(`[table ${node.table.body.length} rows, header ${node.table.headerRows || 0}]`); node.table.body.forEach(row => { textLayer(row, out); out.push('|'); }); return out; }
  if (node.columns) { out.push('[columns]'); textLayer(node.columns, out); return out; }
  if (node.stack) { textLayer(node.stack, out); return out; }
  if (node.text !== undefined) { textLayer(node.text, out); return out; }
  return out;
}

export function layerOf(definition) {
  const lines = textLayer(definition.content);
  lines.push('[header page 2]', ...textLayer(definition.header(2, 2)));
  lines.push('[footer page 1 of 2]', ...textLayer(definition.footer(1, 2)));
  return lines;
}

const LANGUAGES = [['sk', null], ['cs', null], ['en', null], ['de', null], ['sk', 'en']];

describe('docDefinition snapshots', () => {
  TEMPLATE_IDS.forEach(template => {
    LANGUAGES.forEach(([language, secondLanguage]) => {
      it(`${template} ${language}${secondLanguage ? `+${secondLanguage}` : ''}`, () => {
        const definition = buildDocDefinition(fx.invoice, fx.company, { template, language, secondLanguage, images: { logo: fx.PNG_ALPHA, stamp: fx.PNG_ALPHA }, issuedBy: 'Ján Novák' });
        expect(layerOf(definition)).toMatchSnapshot();
      });
    });
  });

  it('reverse charge, CZK, credit note, non-payer, quote and paid invoice', () => {
    expect(layerOf(buildDocDefinition(fx.reverseChargeInvoice, fx.company))).toMatchSnapshot();
    expect(layerOf(buildDocDefinition(fx.czkInvoice, fx.company))).toMatchSnapshot();
    expect(layerOf(buildDocDefinition(fx.creditNote, fx.company))).toMatchSnapshot();
    expect(layerOf(buildDocDefinition(fx.nonPayerInvoice, fx.nonPayerCompany))).toMatchSnapshot();
    expect(layerOf(buildDocDefinition(fx.quote, fx.company, { language: 'de' }))).toMatchSnapshot();
    expect(layerOf(buildDocDefinition(fx.paidInvoice, fx.company))).toMatchSnapshot();
  });
});

describe('docDefinition content rules', () => {
  const layer = (doc, company = fx.company, options = {}) => layerOf(buildDocDefinition(doc, company, options)).join('\n');

  it('uses the Inter font, A4 and the page number in the footer', () => {
    const d = buildDocDefinition(fx.invoice, fx.company);
    expect(d.defaultStyle.font).toBe('Inter');
    expect(d.pageSize).toBe('A4');
    expect(textLayer(d.footer(2, 3))).toContain('Strana 2/3');
    expect(d.info.title).toBe('Faktúra 2026001');
  });

  it('keeps Slovak, Czech and German diacritics in the text layer', () => {
    expect(layer(fx.invoice)).toContain('Žltý ďateľ, a. s.');
    expect(layer({ ...fx.invoice, buyer: fx.czBuyer })).toContain('Příliš žluťoučký kůň s.r.o.');
    expect(layer({ ...fx.invoice, buyer: fx.deBuyer, language: 'de' })).toContain('Große Bäckerei Müller GmbH');
    expect(layer({ ...fx.invoice, buyer: fx.deBuyer, language: 'de' })).toContain('Bemessungsgrundlage gesamt');
  });

  it('prints a PAY by square QR for an unpaid EUR invoice and none when paid', () => {
    expect(layer(fx.invoice)).toMatch(/\[qr /);
    expect(layer(fx.invoice)).toContain('PAY by square');
    const paid = layer(fx.paidInvoice);
    expect(paid).not.toMatch(/\[qr /);
    expect(paid).toContain('Doklad je uhradený, neplaťte');
  });

  it('prints QR Platba for a CZK invoice on the Czech account', () => {
    const d = buildDocDefinition(fx.czkInvoice, fx.company);
    const text = layerOf(d).join('\n');
    expect(text).toContain('QR Platba');
    expect(text).toContain('1 EUR = 25,2 CZK');
    expect(text).toContain('DPH v EUR');
  });

  it('prints no QR for a credit note, a quote, a cash payment or a zero amount', () => {
    expect(layer(fx.creditNote)).not.toMatch(/\[qr /);
    expect(layer(fx.creditNote)).toContain('Opravný doklad k faktúre č. 2026002');
    expect(layer(fx.creditNote)).toContain('Suma na vrátenie');
    expect(layer(fx.quote)).not.toMatch(/\[qr /);
    expect(layer({ ...fx.invoice, paymentMethod: 'CASH' })).not.toMatch(/\[qr /);
    expect(layer({ ...fx.invoice, totals: { ...fx.invoice.totals, payable: '0.00' } })).not.toMatch(/\[qr /);
  });

  it('prints the reverse charge note from the legislation file, in both languages', () => {
    const text = layer(fx.reverseChargeInvoice);
    expect(text).toContain('prenesenie daňovej povinnosti / reverse charge (§ 69 ods. 12 zákona o DPH)');
    expect(text).toContain('Dodávateľ / Supplier');
    expect(text).toContain('Faktúra / Invoice 2026003');
  });

  it('prints the non-payer note and no VAT columns for a non-payer', () => {
    const text = layer(fx.nonPayerInvoice, fx.nonPayerCompany);
    expect(text).toContain('Nie je platiteľ DPH');
    expect(text).not.toContain('Sadzba DPH');
    expect(text).not.toContain('Rekapitulácia DPH');
    expect(text).toContain('300,00 EUR');
  });

  it('shows the discount column only when a line has a discount', () => {
    expect(layer(fx.invoice)).toContain('Zľava');
    expect(layer(fx.longInvoice)).not.toContain('Zľava');
  });

  it('repeats the table header on every page and never splits a row', () => {
    const d = buildDocDefinition(fx.longInvoice, fx.company);
    const table = d.content.find(n => n.table && n.table.headerRows).table;
    expect(table.headerRows).toBe(1);
    expect(table.dontBreakRows).toBe(true);
    expect(table.body.length).toBe(61);
  });

  it('honours showMadeWith and the custom footer text', () => {
    const silent = buildDocDefinition(fx.invoice, { ...fx.company, defaults: { ...fx.company.defaults, showMadeWith: false, texts: { footer: 'Tešíme sa na ďalšiu spoluprácu.' } } });
    const footer = textLayer(silent.footer(1, 1)).join('\n');
    expect(footer).not.toContain('Vystavené vo WE Invoice');
    expect(footer).toContain('Tešíme sa na ďalšiu spoluprácu.');
    expect(textLayer(buildDocDefinition(fx.invoice, fx.company, { showMadeWith: true }).footer(1, 1)).join('\n')).toContain('Vystavené vo WE Invoice');
  });

  it('embeds attachments as PDF/A-3 files', () => {
    const d = buildDocDefinition(fx.invoice, fx.company, { attachments: [{ name: 'invoice.xml', data: '<Invoice/>', mime: 'application/xml' }] });
    expect(d.subset).toBe('PDF/A-3b');
    expect(d.version).toBe('1.7');
    expect(d.files['invoice.xml'].src.startsWith('data:application/xml;base64,')).toBe(true);
    expect(d.files['invoice.xml'].relationship).toBe('Alternative');
    expect(buildDocDefinition(fx.invoice, fx.company).subset).toBeUndefined();
  });

  it('falls back to the classic template and Slovak for unknown settings', () => {
    const d = buildDocDefinition({ ...fx.invoice, template: 'NOPE', language: 'xx' }, fx.company);
    expect(d.pageMargins).toEqual([40, 40, 40, 60]);
    expect(layerOf(d).join('\n')).toContain('Dátum vyhotovenia');
  });
});

// § 74 ods. 1 zákona o DPH: a discount not included in the unit price must be
// on the invoice, so every template can show the discount column (it is
// hidden only when no line has a discount).
describe('discount column', () => {
  it.each(TEMPLATE_IDS)('%s can print line discounts for payers and non-payers', (id) => {
    const text = JSON.stringify(buildDocDefinition({ ...fx.invoice, template: id }, fx.company));
    expect(text).toContain('10 %');
  });
});

describe('template list', () => {
  it('matches the template enum of the schema, which the settings show', async () => {
    const { schema } = await import('@we-invoice/core');
    const { TEMPLATE_IDS } = await import('./templates/index.js');
    expect([...TEMPLATE_IDS].sort()).toEqual([...schema.DOCUMENT_TEMPLATES].sort());
  });
});
