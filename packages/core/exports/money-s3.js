// Money S3 XML (Solitea, "XML prenos dát") for the accountant: issued
// invoices in SeznamFaktVyd, received ones in SeznamFaktPrij. Amounts are
// without VAT per rate group: SouhrnDPH holds the zero base and the two
// main rates (Zaklad5/DPH5 is the reduced, Zaklad22/DPH22 the standard
// group by the program's historic names), further rates go to
// SeznamDalsiSazby. Partner data is the snapshot on the document.
import { el, leaf, serializeXml } from './xml.js';
import { selectDocuments, documentTotals, breakdownByCode, periodDate, isPurchase } from './period.js';
import { partnerOf } from './pohoda.js';

const ISSUED = ['INVOICE', 'SELF_BILLING', 'CREDIT_NOTE', 'DEBIT_NOTE', 'PROFORMA'];
const RECEIVED = ['RECEIVED_INVOICE', 'RECEIVED_CREDIT_NOTE'];
const PAYMENT = { TRANSFER: 'prevodom', CASH: 'v hotovosti', CARD: 'kartou', COD: 'dobierkou', OFFSET: 'zápočtom', ONLINE: 'online', QR_ON_SITE: 'prevodom' };

function partner(party) {
  const a = party.address || {};
  return el('DodOdb', null,
    leaf('ObchNazev', party.name),
    el('ObchAdresa', null, leaf('Ulice', a.street), leaf('Misto', a.city), leaf('PSC', a.zip), leaf('KodStatu', a.country)),
    leaf('ICO', party.ico),
    leaf('DIC', party.icDph || party.dic),
    leaf('DICSK', party.dic),
    leaf('Tel', party.phone),
    leaf('EMail', party.email));
}

function vatSummary(totals, date) {
  const b = breakdownByCode(totals, date);
  const extra = [b.REDUCED_2.base !== '0.00' ? { rate: 'REDUCED_2', ...b.REDUCED_2 } : null, ...b.other.map(o => ({ rate: o.rate, base: o.base, vat: o.vat }))].filter(Boolean);
  return el('SouhrnDPH', null,
    leaf('Zaklad0', b.none),
    leaf('Zaklad5', b.REDUCED_1.base), leaf('DPH5', b.REDUCED_1.vat),
    leaf('Zaklad22', b.STANDARD.base), leaf('DPH22', b.STANDARD.vat),
    extra.length ? el('SeznamDalsiSazby', null, extra.map(x => el('DalsiSazba', null,
      leaf('HladinaDPH', x.rate === 'REDUCED_2' ? '3' : '4'),
      leaf('Zaklad', x.base), leaf('DPH', x.vat)))) : null);
}

function items(document, totals) {
  const source = (document.lines || []).filter(l => !l.kind || l.kind === 'ITEM');
  return el('SeznamPolozek', null, totals.lines.map((a, i) => {
    const line = source[i] || {};
    return el('Polozka', null,
      leaf('Popis', line.name),
      leaf('PocetMJ', line.qty),
      leaf('MJ', line.unit && (line.unit.label || line.unit.code)),
      leaf('Cena', a.unitNet),
      leaf('SazbaDPH', a.rate ?? '0'),
      leaf('TypCeny', '0'),
      leaf('Sleva', line.discountPct),
      leaf('CenaPoSleve', a.net),
      leaf('Valuty', document.currency && document.currency !== 'EUR' ? a.net : null));
  }));
}

function invoice(tag, document) {
  const totals = documentTotals(document);
  const date = periodDate(document);
  const foreign = document.currency && document.currency !== 'EUR';
  const credit = document.kind === 'CREDIT_NOTE' || document.kind === 'RECEIVED_CREDIT_NOTE';
  return el(tag, null,
    leaf('Doklad', document.number),
    isPurchase(document) ? leaf('PrijatDokl', document.number) : null,
    leaf('Popis', document.textIntro || (document.lines || [])[0]?.name),
    leaf('DatVyst', document.issueDate || date),
    leaf('DatUcPr', date),
    leaf('DatPln', document.taxDate || date),
    leaf('DatSplat', document.dueDate),
    leaf('VarSymbol', document.vs),
    leaf('KonstSym', document.ks),
    leaf('SpecSymbol', document.ss),
    leaf('Dobropis', credit ? '1' : '0'),
    leaf('Proforma', document.kind === 'PROFORMA' ? '1' : null),
    leaf('Uhrada', PAYMENT[document.paymentMethod]),
    vatSummary(totals, date),
    leaf('Celkem', totals.gross),
    foreign ? el('Valuty', null,
      el('Mena', null, leaf('Kod', document.currency), leaf('Mnozstvi', '1'), leaf('Kurs', document.fxRate)),
      leaf('Celkem', totals.gross)) : null,
    partner(partnerOf(document)),
    items(document, totals),
    leaf('Pozn', document.textOutro));
}

/**
 * @param {{documents: object[], company: object}} data
 * @param {{from?: string, to?: string, now?: string}} [ctx]
 * @returns {{content: string, count: number, skipped: Array<{id: string, number: string, reason: string}>}}
 */
export function exportMoneyS3(data, ctx = {}) {
  const docs = selectDocuments(data.documents, { from: ctx.from, to: ctx.to, includeCancelled: false });
  const issued = docs.filter(d => ISSUED.includes(d.kind));
  const received = docs.filter(d => RECEIVED.includes(d.kind));
  const skipped = docs.filter(d => !ISSUED.includes(d.kind) && !RECEIVED.includes(d.kind))
    .map(d => ({ id: d.id, number: d.number, reason: 'KIND_NOT_IN_MONEY' }));
  const company = data.company || {};
  const [expDate, expTime] = String(ctx.now || '').split('T');
  const root = el('MoneyData', {
    ICAgendy: company.ico, JazykVerze: 'SK', description: 'WE Invoice',
    ExpZkratka: '_FA', ExpDate: expDate, ExpTime: expTime ? expTime.slice(0, 8) : null
  },
  issued.length ? el('SeznamFaktVyd', null, issued.map(d => invoice('FaktVyd', d))) : null,
  received.length ? el('SeznamFaktPrij', null, received.map(d => invoice('FaktPrij', d))) : null);
  return { content: serializeXml(root), count: issued.length + received.length, skipped };
}
