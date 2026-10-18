// Sample documents and companies for the PDF tests: a VAT payer, a
// non-payer, a Czech customer, an invoice with a credit note, a long
// invoice of 60 lines. Totals are written as the core would compute them;
// identifiers are synthetic.

export const SK_IBAN = 'SK3112000000198742637541';
export const CZ_IBAN = 'CZ6508000000192000145399';

export const company = {
  id: 'c1', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  name: 'Biela orlica s. r. o.', legalForm: 'SRO', taxpayerType: 'PO',
  ico: '12345678', dic: '2020123456', icDph: 'SK2020123456', vatMode: 'PAYER', vatPeriod: 'MONTH',
  cashBasis: false, oss: false, usesEkasa: false,
  registerEntry: 'Zapísaná v OR Mestského súdu Bratislava III, oddiel Sro, vložka č. 12345/B',
  address: { street: 'Hlavná 1', city: 'Bratislava', zip: '811 01', country: 'SK' },
  bankAccounts: [
    { id: 'b1', name: 'Hlavný účet', iban: SK_IBAN, bic: 'UNCRSKBX', currency: 'EUR', isDefault: true },
    { id: 'b2', name: 'Český účet', iban: CZ_IBAN, bic: 'GIBACZPX', currency: 'CZK', isDefault: false }
  ],
  email: 'faktury@bielaorlica.sk', phone: '+421 900 123 456', web: 'www.bielaorlica.sk',
  accountingMode: 'EXTERNAL',
  defaults: {
    dueDays: 14, currency: 'EUR', language: 'sk', secondLanguage: null, template: 'CLASSIC', brandColor: '#1f4e79',
    texts: { intro: null, outro: null, footer: null }, paymentMethod: 'TRANSFER', roundingCash: false,
    pdfFileMask: '{kind}_{number}_{buyer}', showMadeWith: true, attachPdfToEInvoice: false
  }
};

export const nonPayerCompany = {
  ...company,
  id: 'c2', name: 'Ján Novák', legalForm: 'FO_ZIVNOST', taxpayerType: 'FO', icDph: null, vatMode: 'NONPAYER',
  registerEntry: 'Zapísaný v ŽR Okresného úradu Bratislava, č. živn. reg. 110-123456',
  defaults: { ...company.defaults, template: 'MINIMAL', brandColor: '#2e7d32' }
};

const seller = {
  contactId: null, name: company.name, ico: company.ico, dic: company.dic, icDph: company.icDph,
  address: company.address, registerEntry: company.registerEntry, email: company.email, phone: company.phone,
  peppolId: null, vatPayer: true
};

const buyer = {
  contactId: 'k1', name: 'Žltý ďateľ, a. s.', ico: '87654321', dic: '2020654321', icDph: 'SK2020654321',
  address: { street: 'Krátka 22', city: 'Košice', zip: '040 01', country: 'SK' },
  registerEntry: null, email: null, phone: null, peppolId: null, vatPayer: true
};

export const czBuyer = {
  contactId: 'k2', name: 'Příliš žluťoučký kůň s.r.o.', ico: '11223344', dic: 'CZ11223344', icDph: 'CZ11223344',
  address: { street: 'Dlouhá 5', city: 'Praha 1', zip: '110 00', country: 'CZ' },
  registerEntry: null, email: null, phone: null, peppolId: null, vatPayer: true
};

export const deBuyer = {
  contactId: 'k3', name: 'Große Bäckerei Müller GmbH', ico: null, dic: null, icDph: 'DE123456789',
  address: { street: 'Königstraße 7', city: 'München', zip: '80331', country: 'DE' },
  registerEntry: null, email: null, phone: null, peppolId: null, vatPayer: true
};

const line = (id, name, qty, unitPrice, rate = '23', extra = {}) => ({
  id, kind: 'ITEM', itemId: null, name, description: '', qty, unit: { code: 'C62', label: 'ks' }, unitPrice,
  baseQty: null, priceType: 'NET', discountPct: null, vatRate: rate, vatCategory: 'S', exemptionReasonCode: null,
  exemptionReasonText: null, accountingCategory: null, warehouseId: null, ...extra
});

const base = {
  createdAt: '2026-10-01T08:00:00Z', updatedAt: '2026-10-01T08:00:00Z', deleted: false,
  seriesId: 's1', status: 'ISSUED', deliveryDate: null, receivedDate: null, validUntil: null, periodFrom: null, periodTo: null,
  vatDeductionPeriod: null, fxRate: null, fxRateDate: null, fxSource: null, contactId: 'k1', docDiscount: null, rounding: null,
  paymentMethod: 'TRANSFER', bankAccountId: 'b1', paymentLink: null, buyerReference: null, orderReference: null, contractReference: null,
  correctionReason: null, classified: false, textIntro: null, textOutro: null, noteInternal: null, language: 'sk', secondLanguage: null,
  template: 'CLASSIC', links: [], payments: [], peppol: null, pdfFileId: null, attachments: [], sendLog: [], exportedAt: null,
  lockedAt: null, recurringTemplateId: null, recurringPeriodStart: null, tags: [], projectRef: null, ks: '0308', ss: null
};

export const invoice = {
  ...base,
  id: 'd1', kind: 'INVOICE', number: '2026001', vs: '2026001',
  issueDate: '2026-10-18', taxDate: '2026-10-15', dueDate: '2026-11-01', currency: 'EUR',
  seller, buyer,
  orderReference: 'OBJ-77',
  textIntro: 'Fakturujeme Vám za dodané služby podľa zmluvy č. 5/2026.',
  textOutro: 'Ďakujeme za Vašu dôveru.',
  lines: [
    line('l1', 'Konzultácia účtovníctva', '2', '100.00', '23', { description: 'Hodinová sadzba, október 2026', unit: { code: 'HUR', label: 'hod' } }),
    line('l2', 'Žiarovka LED 9 W', '10', '3.50', '23', { discountPct: '10' }),
    line('l3', 'Kniha: Účtovníctvo pre začiatočníkov', '1', '19.90', '5'),
    { id: 'l4', kind: 'TEXT', name: 'Doprava a balné', qty: '0', unitPrice: '0', vatCategory: 'S' },
    line('l5', 'Doprava', '1', '8.00', '23')
  ],
  totals: {
    lineNet: '259.40', allowances: '0.00', charges: '0.00', net: '259.40', vat: '56.08', vatEur: null, gross: '315.48',
    prepaid: '0.00', rounding: '0.00', payable: '315.48',
    breakdown: [{ category: 'S', rate: '23', base: '239.50', vat: '55.09' }, { category: 'S', rate: '5', base: '19.90', vat: '1.00' }]
  }
};

export const paidInvoice = { ...invoice, id: 'd2', number: '2026002', vs: '2026002', status: 'PAID', payments: [{ id: 'p1', date: '2026-10-20', amount: '315.48', currency: 'EUR', method: 'TRANSFER', source: 'BANK_IMPORT', bankTxId: null, cashBookId: null, ekasaReceiptId: null, ekasaOkp: null, note: null }] };

export const reverseChargeInvoice = {
  ...invoice, id: 'd3', number: '2026003', vs: '2026003', buyer: czBuyer, language: 'sk', secondLanguage: 'en',
  lines: [line('l1', 'Vývoj softvéru', '40', '50.00', null, { vatCategory: 'AE', vatRate: null, unit: { code: 'HUR', label: 'hod' } })],
  totals: { lineNet: '2000.00', allowances: '0.00', charges: '0.00', net: '2000.00', vat: '0.00', vatEur: null, gross: '2000.00', prepaid: '0.00', rounding: '0.00', payable: '2000.00', breakdown: [{ category: 'AE', rate: null, base: '2000.00', vat: '0.00' }] }
};

export const czkInvoice = {
  ...invoice, id: 'd4', number: '2026004', vs: '2026004', buyer: czBuyer, currency: 'CZK', fxRate: '25.20', fxRateDate: '2026-10-18', fxSource: 'ECB',
  bankAccountId: 'b2', language: 'cs', template: 'MODERN',
  lines: [line('l1', 'Servisní práce', '3', '1200.00', '23')],
  totals: { lineNet: '3600.00', allowances: '0.00', charges: '0.00', net: '3600.00', vat: '828.00', vatEur: '32.86', gross: '4428.00', prepaid: '0.00', rounding: '0.00', payable: '4428.00', breakdown: [{ category: 'S', rate: '23', base: '3600.00', vat: '828.00' }] }
};

export const creditNote = {
  ...invoice, id: 'd5', kind: 'CREDIT_NOTE', number: '2026D01', vs: '2026001', issueDate: '2026-10-25', taxDate: '2026-10-25',
  links: [{ kind: 'CORRECTS', docId: 'd2', number: '2026002', amount: null }], correctionReason: 'Vrátený tovar',
  lines: [line('l1', 'Žiarovka LED 9 W', '-2', '3.50', '23')],
  totals: { lineNet: '-7.00', allowances: '0.00', charges: '0.00', net: '-7.00', vat: '-1.61', vatEur: null, gross: '-8.61', prepaid: '0.00', rounding: '0.00', payable: '-8.61', breakdown: [{ category: 'S', rate: '23', base: '-7.00', vat: '-1.61' }] }
};

export const proforma = { ...invoice, id: 'd6', kind: 'PROFORMA', number: 'ZF2026001', vs: '9026001', taxDate: null };

export const nonPayerInvoice = {
  ...invoice, id: 'd7', number: 'FA-2026-01', vs: '202601', template: 'MINIMAL',
  seller: { ...seller, name: nonPayerCompany.name, icDph: null, registerEntry: nonPayerCompany.registerEntry, vatPayer: false },
  lines: [line('l1', 'Maliarske práce', '12', '25.00', null, { unit: { code: 'HUR', label: 'hod' } })],
  totals: { lineNet: '300.00', allowances: '0.00', charges: '0.00', net: '300.00', vat: '0.00', vatEur: null, gross: '300.00', prepaid: '0.00', rounding: '0.00', payable: '300.00', breakdown: [] }
};

export const quote = { ...invoice, id: 'd8', kind: 'QUOTE', number: 'CP2026001', vs: null, taxDate: null, dueDate: null, validUntil: '2026-11-30' };

export const longInvoice = {
  ...invoice, id: 'd9', number: '2026060', vs: '2026060', template: 'COMPACT',
  lines: Array.from({ length: 60 }, (_, i) => line(`l${i + 1}`, `Položka č. ${i + 1} s dlhším názvom tovaru alebo služby`, String(i + 1), '12.34', '23')),
  totals: { lineNet: '22582.20', allowances: '0.00', charges: '0.00', net: '22582.20', vat: '5193.91', vatEur: null, gross: '27776.11', prepaid: '0.00', rounding: '0.00', payable: '27776.11', breakdown: [{ category: 'S', rate: '23', base: '22582.20', vat: '5193.91' }] }
};

// A 2x2 PNG with an alpha channel, for the logo, stamp and signature.
export const PNG_ALPHA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR4nGOQ96v8zwADIA4AH2EDyyFCvfgAAAAASUVORK5CYII=';
