// XML of the kontrolný výkaz DPH, form KVDPHv25 (official XSD
// kv_dph_2025.xsd of Finančná správa, root KVDPH_2025, see forms/kv.json):
// Identifikacia with the payer, the kind of filing and the period, then
// Transakcie with the rows in the order the schema fixes:
// A1, A2, B1, B2, B31, B32, C1, C2, D1, D2. Attribute names:
//   Odb / Dod  VAT id of the buyer / supplier
//   F          invoice number;  FO / FP  correcting and original invoice
//   Den        tax point;  Z / D  base / VAT;  S  rate;  O  VAT deducted
//   ZR / DR / OR  difference of base, VAT and deducted VAT (C.1, C.2)
//   D1, D2     Z / D at the standard rate, ZZn / DZn at the reduced rates,
//              SumaObratov (D1) the turnover with VAT
// An optional attribute without a value is left out, never written empty.
import { el, toXml } from './xml.js';
import { parsePeriod } from './periods.js';
import { add } from '../money/index.js';
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

// D.1 and D.2 have one pair of columns for the standard rate and one for
// the reduced rate. Both reduced rates (19 % and 5 %) are summed into
// ZZn / DZn, as the poučenie did for 10 % and 5 % ("v členení podľa
// sadzieb dane", one pair of columns for the reduced rate). That summing
// waits for the confirmation of an accountant (forms/kv.json, verified).
function totalsRow(name, rows, form, withTurnover) {
  if (!rows.length) return null;
  const sums = {};
  let turnover = '0';
  for (const row of rows) {
    const [baseName, vatName] = form.rateColumns[row.code];
    sums[baseName] = add(sums[baseName] || '0', row.base);
    sums[vatName] = add(sums[vatName] || '0', row.vat);
    turnover = add(turnover, add(row.base, row.vat));
  }
  const attrs = withTurnover ? { SumaObratov: amountText(turnover) } : {};
  for (const column of ['Z', 'D', 'ZZn', 'DZn']) attrs[column] = amountText(sums[column] || '0');
  return el(name, attrs);
}

const optional = (value) => (value ? value : null);

/** @returns {string} */
export function kvXml(kv, records, company, form) {
  const s = kv.sections;
  const rows = {
    A1: s.A1.map(r => el('A1', { Odb: r.buyer, F: r.number, Den: r.date, Z: r.base, D: r.vat, S: r.rate })),
    A2: s.A2.map(r => el('A2', { Odb: r.buyer, F: r.number, Den: r.date, Z: r.base })),
    B1: s.B1.map(r => el('B1', { Dod: optional(r.supplier), F: r.number, Den: r.date, Z: r.base, D: r.vat, S: r.rate, O: r.deductible })),
    B2: s.B2.map(r => el('B2', { Dod: r.supplier, F: r.number, Den: r.date, Z: r.base, D: r.vat, S: r.rate, O: r.deductible })),
    B31: s.B3.total && !s.B3.perSupplier ? [el('B31', { Z: s.B3.total.base, D: s.B3.total.vat, O: s.B3.total.deductible })] : [],
    B32: s.B3.perSupplier ? s.B3.suppliers.map(r => el('B32', { Dod: r.supplier, Z: r.base, D: r.vat, O: r.deductible })) : [],
    C1: s.C1.map(r => el('C1', { Odb: r.buyer, FO: r.number, FP: r.original, ZR: r.base, DR: r.vat, S: r.rate })),
    C2: s.C2.map(r => el('C2', { Dod: r.supplier, FO: r.number, FP: r.original, ZR: r.base, DR: r.vat, S: r.rate, OR: r.deductible })),
    D1: [totalsRow('D1', s.D1, form, true)],
    D2: [totalsRow('D2', s.D2, form, false)]
  };
  const root = el(form.rootElement, { xmlns: form.namespace },
    identification(company, records.period, kv.type),
    el('Transakcie', {}, ...form.sectionOrder.flatMap(section => rows[section])));
  return toXml(root);
}
