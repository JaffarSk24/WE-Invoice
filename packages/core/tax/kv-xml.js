// XML of the kontrolný výkaz DPH. Layout of KVDPH (Finančná správa XSD,
// version and namespace in forms/kv.json): Identifikacia with the payer,
// the kind of filing and the period, then Transakcie with one element per
// row of sections A.1 to D.2. Attribute names by the XSD:
//   Odb / Dod  VAT id of the buyer / supplier
//   F          invoice number;  FO / FP  correcting and original invoice
//   Den        tax point;  Z / D  base / VAT;  S  rate;  O  VAT deducted
//   ZR / DR / OR  difference of base, VAT and deducted VAT (C.1, C.2)
// The layout was written from the published description and is not yet
// validated against the official XSD file (see tests/fixtures/tax/xsd).
import { el, toXml } from './xml.js';
import { parsePeriod } from './periods.js';
import { amountText, splitStreet, companyVatId } from './forms.js';

const COUNTRY_NAMES = { SK: 'Slovenská republika' };

export function identification(company, period, type) {
  const p = parsePeriod(period);
  const address = company.address || {};
  const [street, number] = splitStreet(address.street);
  return el('Identifikacia', {},
    el('IcDphPlatitela', {}, companyVatId(company)),
    el('Druh', {}, type),
    el('Obdobie', {}, el('Rok', {}, String(p.year)), p.kind === 'MONTH' ? el('Mesiac', {}, String(p.month)) : el('Stvrtrok', {}, String(p.quarter))),
    el('Nazov', {}, company.name || ''),
    el('Stat', {}, COUNTRY_NAMES[address.country || 'SK'] || address.country || ''),
    el('Obec', {}, address.city || ''),
    el('PSC', {}, String(address.zip || '').replace(/\s+/g, '')),
    el('Ulica', {}, street),
    el('Cislo', {}, number),
    company.phone ? el('Tel', {}, company.phone) : null,
    company.email ? el('Email', {}, company.email) : null);
}

function totalsRow(name, rows, form) {
  if (!rows.length) return null;
  const attrs = {};
  for (const row of rows) {
    const names = form.rateTotals[row.rate];
    if (!names) continue;
    attrs[names[0]] = amountText(row.base);
    attrs[names[1]] = amountText(row.vat);
  }
  return el(name, attrs);
}

/** @returns {string} */
export function kvXml(kv, records, company, form) {
  const s = kv.sections;
  const rows = [
    ...s.A1.map(r => el('A1', { Odb: r.buyer, F: r.number, Den: r.date, Z: r.base, D: r.vat, S: r.rate })),
    ...s.A2.map(r => el('A2', { Odb: r.buyer, F: r.number, Den: r.date, Z: r.base })),
    ...s.B1.map(r => el('B1', { Dod: r.supplier, F: r.number, Den: r.date, Z: r.base, D: r.vat, S: r.rate, O: r.deductible })),
    ...s.B2.map(r => el('B2', { Dod: r.supplier, F: r.number, Den: r.date, Z: r.base, D: r.vat, S: r.rate, O: r.deductible })),
    s.B3.total && !s.B3.perSupplier ? el('B3', { Z: s.B3.total.base, D: s.B3.total.vat, O: s.B3.total.deductible }) : null,
    ...(s.B3.perSupplier ? s.B3.suppliers.map(r => el('B3', { Dod: r.supplier, Z: r.base, D: r.vat, O: r.deductible })) : []),
    ...s.C1.map(r => el('C1', { Odb: r.buyer, FO: r.number, FP: r.original, ZR: r.base, DR: r.vat, S: r.rate })),
    ...s.C2.map(r => el('C2', { Dod: r.supplier, FO: r.number, FP: r.original, ZR: r.base, DR: r.vat, S: r.rate, OR: r.deductible })),
    totalsRow('D1', s.D1, form),
    totalsRow('D2', s.D2, form)
  ];
  const root = el(form.rootElement, { xmlns: form.namespace },
    identification(company, records.period, kv.type),
    el('Transakcie', {}, ...rows));
  return toXml(root);
}
