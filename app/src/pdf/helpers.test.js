// The pure helpers of the PDF module: formatting, line amounts, labels,
// file names, legal notes, mandatory particulars and the QR choice.
import { describe, it, expect } from 'vitest';
import { formatters } from './format.js';
import { lineAmounts, linesWithAmounts, amountDue, sum, negate } from './amounts.js';
import { printLabels } from './labels.js';
import { transliterate, safePart, pdfFileName } from './filename.js';
import { legalNotes, validOn } from './legal.js';
import { missingRequisites } from './requisites.js';
import { documentQr, bankAccountFor } from './qr.js';
import { normalizeBrand, textOn, tint } from './theme.js';
import * as fx from '../../../tests/fixtures/pdf/documents.js';

describe('formatters', () => {
  it('formats dates, amounts and percentages by language without non-breaking spaces', () => {
    const sk = formatters('sk');
    expect(sk.date('2026-10-18')).toBe('18. 10. 2026');
    expect(sk.amount('1234.5')).toBe('1 234,50');
    expect(sk.money('1234567.891', 'EUR')).toBe('1 234 567,89 EUR');
    expect(sk.qty('2.5000')).toBe('2,5');
    expect(sk.percent('23')).toBe('23 %');
    expect(sk.amount('1234.50')).not.toMatch(new RegExp(`[${String.fromCharCode(0xa0)}${String.fromCharCode(0x202f)}]`));
    const en = formatters('en');
    expect(en.date('2026-10-18')).toBe('18/10/2026');
    expect(en.amount('1234.5')).toBe('1,234.50');
    expect(en.percent('5')).toBe('5%');
    expect(formatters('de').date('2026-01-05')).toBe('05.01.2026');
    expect(formatters('cs').amount('99999.99')).toBe('99 999,99');
  });

  it('keeps big decimal strings exact', () => {
    expect(formatters('en').amount('12345678901234567.89')).toBe('12,345,678,901,234,567.89');
    expect(formatters('sk').date('')).toBe('');
    expect(formatters('sk').amount(null)).toBe('');
  });
});

describe('line amounts', () => {
  it('derives net, VAT and gross half-up from qty, price, discount and rate', () => {
    expect(lineAmounts({ qty: '10', unitPrice: '3.50', discountPct: '10', vatRate: '23', vatCategory: 'S' })).toEqual({ unitNet: '3.50', net: '31.50', vat: '7.25', gross: '38.75', discount: '3.50' });
    expect(lineAmounts({ qty: '3', unitPrice: '0.335', vatRate: '23', vatCategory: 'S' }).net).toBe('1.01');
    expect(lineAmounts({ qty: '1', unitPrice: '123.00', priceType: 'GROSS', vatRate: '23', vatCategory: 'S' })).toMatchObject({ unitNet: '100.00', net: '100.00', vat: '23.00', gross: '123.00' });
    expect(lineAmounts({ qty: '2', unitPrice: '50', vatRate: '23', vatCategory: 'AE' })).toMatchObject({ net: '100.00', vat: '0.00', gross: '100.00' });
    expect(lineAmounts({ qty: '2', unitPrice: '50', vatRate: '23', vatCategory: 'S' }, false)).toMatchObject({ net: '100.00', vat: '0.00', gross: '100.00' });
    expect(lineAmounts({ qty: '1', unitPrice: '1', net: '7.00', gross: '8.61', vat: '1.61' })).toMatchObject({ net: '7.00', gross: '8.61' });
  });

  it('gives subtotal lines the running sum', () => {
    const rows = linesWithAmounts([
      { kind: 'ITEM', qty: '1', unitPrice: '10', vatRate: '23', vatCategory: 'S' },
      { kind: 'ITEM', qty: '2', unitPrice: '5', vatRate: '23', vatCategory: 'S' },
      { kind: 'SUBTOTAL', name: 'Spolu' },
      { kind: 'TEXT', name: 'Note' },
      { kind: 'ITEM', qty: '1', unitPrice: '1', vatRate: '23', vatCategory: 'S' },
      { kind: 'SUBTOTAL' }
    ]);
    expect(rows[2].amounts).toEqual({ net: '20.00', gross: '24.60', vat: '4.60' });
    expect(rows[3].amounts).toBeNull();
    expect(rows[5].amounts.net).toBe('1.00');
  });

  it('computes the amount due from payable and payments, never below zero', () => {
    expect(amountDue(fx.invoice)).toBe('315.48');
    expect(amountDue(fx.paidInvoice)).toBe('0.00');
    expect(amountDue({ totals: { payable: '10.00' }, payments: [{ amount: '4.00' }, { amount: '7.00' }] })).toBe('0.00');
    expect(sum(['1.005', '2'])).toBe('3.01');
    expect(negate('5.5')).toBe('-5.50');
  });
});

describe('print labels', () => {
  it('prints one language, two languages, and falls back to English then the key', () => {
    expect(printLabels('sk').L('field.supplier')).toBe('Dodávateľ');
    expect(printLabels('sk', 'en').L('field.supplier')).toBe('Dodávateľ / Supplier');
    expect(printLabels('sk', 'en').L('field.iban')).toBe('IBAN');
    expect(printLabels('sk', 'sk').bilingual).toBe(false);
    expect(printLabels('xx').language).toBe('sk');
    expect(printLabels('de').L('nope.key')).toBe('nope.key');
    expect(printLabels('cs', 'de').L('footer.page', { page: 1, pages: 2 })).toBe('Strana 1/2 / Seite 1/2');
    expect(printLabels('sk', 'en').pair({ sk: 'a', en: 'b' })).toBe('a / b');
    expect(printLabels('cs').pair({ sk: 'a', cs: null, en: 'b' })).toBe('a');
  });
});

describe('file names', () => {
  it('transliterates and strips forbidden characters', () => {
    expect(transliterate('Žltý ďateľ, Příliš žluťoučký kůň, Große Straße')).toBe('Zlty datel, Prilis zlutoucky kun, Grosse Strasse');
    expect(transliterate('ТОВ «Київ» Євген')).toBe('TOV «Kiiv» Ievgen');
    expect(safePart('A/B\\C:D*E?F"G<H>I|J  K')).toBe('A_B_C_D_E_F_G_H_I_J_K');
    expect(safePart('...  ..')).toBe('');
  });

  it('builds the name from the mask', () => {
    const labels = printLabels('sk');
    expect(pdfFileName(fx.invoice, labels)).toBe('Faktura_2026001_Zlty_datel_a._s.pdf');
    expect(pdfFileName({ ...fx.invoice, kind: 'CREDIT_NOTE', number: 'D/2026/01' }, labels)).toBe('Dobropis_D_2026_01_Zlty_datel_a._s.pdf');
    expect(pdfFileName({ ...fx.invoice, number: null, buyer: { name: '???' } }, labels)).toBe('Faktura_draft.pdf');
    expect(pdfFileName(fx.invoice, labels, '{date}_{vs}')).toBe('2026-10-18_2026001.pdf');
    expect(pdfFileName({ kind: 'INVOICE', number: 'x'.repeat(200) }, labels).length).toBeLessThanOrEqual(124);
  });
});

describe('legal notes', () => {
  const labels = printLabels('sk');
  it('picks the entry valid on the date', () => {
    expect(validOn([{ validFrom: '2020-01-01', validTo: '2024-12-31', v: 1 }, { validFrom: '2025-01-01', validTo: null, v: 2 }], '2024-06-01').v).toBe(1);
    expect(validOn([{ validFrom: '2020-01-01', validTo: '2024-12-31', v: 1 }, { validFrom: '2025-01-01', validTo: null, v: 2 }], '2026-06-01').v).toBe(2);
    expect(validOn([], '2026-06-01')).toBeNull();
  });

  it('lists the notes a document needs, from the legislation file', () => {
    expect(legalNotes(fx.invoice, fx.company, labels)).toEqual([]);
    expect(legalNotes(fx.reverseChargeInvoice, fx.company, labels).map(n => n.text)).toEqual(['prenesenie daňovej povinnosti (§ 69 ods. 12 zákona o DPH)']);
    expect(legalNotes(fx.nonPayerInvoice, fx.nonPayerCompany, labels).map(n => n.key)).toEqual(['nonPayer']);
    const exempt = { ...fx.invoice, lines: [{ ...fx.invoice.lines[0], vatCategory: 'E', vatRate: null }] };
    expect(legalNotes(exempt, fx.company, labels).map(n => n.text)).toEqual(['oslobodenie od dane (§ 28 až § 42 zákona o DPH)']);
    const custom = { ...exempt, lines: [{ ...exempt.lines[0], exemptionReasonText: '§ 38 zákona o DPH' }] };
    expect(legalNotes(custom, fx.company, labels)[0].text).toBe('oslobodenie od dane (§ 38 zákona o DPH)');
    expect(legalNotes({ ...fx.invoice, kind: 'SELF_BILLING' }, { ...fx.company, cashBasis: true }, labels).map(n => n.key)).toEqual(['selfBilling', 'cashBasis']);
    expect(legalNotes(fx.reverseChargeInvoice, fx.company, printLabels('de')).map(n => n.text)).toEqual(['Steuerschuldnerschaft des Leistungsempfängers (§ 69 ods. 12 zákona o DPH)']);
  });
});

describe('mandatory particulars', () => {
  it('accepts the sample documents', () => {
    expect(missingRequisites(fx.invoice, fx.company)).toEqual([]);
    expect(missingRequisites(fx.creditNote, fx.company)).toEqual([]);
    expect(missingRequisites(fx.nonPayerInvoice, fx.nonPayerCompany)).toEqual([]);
    expect(missingRequisites(fx.quote, fx.company)).toEqual([]);
  });

  it('lists what a tax document lacks', () => {
    const bare = { kind: 'INVOICE', seller: { name: 'X', address: { city: 'Y' }, vatPayer: true }, buyer: {}, lines: [{ kind: 'ITEM', name: '', qty: '', unitPrice: '1', vatCategory: 'S' }] };
    expect(missingRequisites(bare, fx.company)).toEqual(['number', 'issueDate', 'lines.name', 'lines.qty', 'seller.ico', 'seller.icDph', 'buyer.name', 'buyer.address', 'taxDate', 'totals', 'lines.vatRate']);
    expect(missingRequisites({ ...fx.creditNote, links: [] }, fx.company)).toEqual(['links.corrects']);
    expect(missingRequisites(bare, { ...fx.company, registerEntry: null })).toContain('seller.registerEntry');
    expect(missingRequisites({ ...fx.nonPayerInvoice, seller: { ...fx.nonPayerInvoice.seller, dic: null } }, fx.nonPayerCompany)).toEqual(['seller.dic']);
    expect(missingRequisites({ ...fx.quote, number: null, lines: [] }, fx.company)).toEqual(['number', 'lines']);
  });
});

describe('document QR', () => {
  it('picks the bank account and the format', () => {
    expect(bankAccountFor(fx.invoice, fx.company).id).toBe('b1');
    expect(bankAccountFor(fx.czkInvoice, fx.company).id).toBe('b2');
    expect(bankAccountFor({ ...fx.invoice, bankAccountId: null, currency: 'CZK' }, fx.company).id).toBe('b2');
    expect(bankAccountFor(fx.invoice, { bankAccounts: [] })).toBeNull();
    expect(documentQr(fx.invoice, fx.company.bankAccounts[0], '315.48').format).toBe('PAY_BY_SQUARE');
    expect(documentQr(fx.czkInvoice, fx.company.bankAccounts[1], '4428.00').text).toContain('SPD*1.0*ACC:CZ6508000000192000145399+GIBACZPX*AM:4428.00*CC:CZK');
    expect(documentQr(fx.invoice, fx.company.bankAccounts[0], '0.00')).toBeNull();
    expect(documentQr(fx.creditNote, fx.company.bankAccounts[0], '8.61')).toBeNull();
    expect(documentQr(fx.invoice, fx.company.bankAccounts[0], '1.00', { qr: false })).toBeNull();
    expect(documentQr(fx.invoice, { iban: 'DE89370400440532013000' }, '1.00')).toBeNull();
  });
});

describe('theme', () => {
  it('normalises the brand colour and picks readable text on it', () => {
    expect(normalizeBrand('#ABC')).toBe('#aabbcc');
    expect(normalizeBrand('red')).toBe('#1f4e79');
    expect(textOn('#1f4e79')).toBe('#ffffff');
    expect(textOn('#ffee00')).toBe('#1a1a1a');
    expect(tint('#000000', 0.5)).toBe('#808080');
  });
});
