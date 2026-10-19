// XML of the daňové priznanie k DPH: a header with the payer, the kind of
// return (riadne, opravné, dodatočné with the date its reasons were found)
// and the period, and a body with every row of the form version in form
// order, empty rows as empty elements. The layout follows the published
// form description and is not yet validated against the official XSD file
// (see forms/dph.json and tests/fixtures/tax/xsd).
import { el, toXml } from './xml.js';
import { parsePeriod } from './periods.js';
import { splitStreet, companyVatId } from './forms.js';

export function vatReturnXml(vr, company, form, ctx = {}) {
  const p = parsePeriod(vr.period);
  const address = company.address || {};
  const [street, number] = splitStreet(address.street);
  const vatId = companyVatId(company);
  const byRow = new Map(vr.rows.map(r => [r.row, r.amount]));
  const header = el('hlavicka', {},
    el('identifikacneCislo', {}, el('kodStatu', {}, vatId.slice(0, 2)), el('cislo', {}, vatId.slice(2))),
    el('typDP', {},
      el('rdp', {}, vr.type === 'R' ? '1' : '0'),
      el('odp', {}, vr.type === 'O' ? '1' : '0'),
      el('ddp', {}, vr.type === 'D' ? '1' : '0')),
    el('zdanovacieObdobie', {},
      el('mesiac', {}, p.kind === 'MONTH' ? String(p.month) : ''),
      el('stvrtrok', {}, p.kind === 'QUARTER' ? String(p.quarter) : ''),
      el('rok', {}, String(p.year)),
      el('datumZisteniaDdp', {}, vr.type === 'D' ? ctx.discoveredOn || '' : '')),
    el('nazovMenoPriezvisko', {}, company.name || ''),
    el('adresa', {},
      el('ulica', {}, street),
      el('supisneOrientacneCislo', {}, number),
      el('psc', {}, String(address.zip || '').replace(/\s+/g, '')),
      el('obec', {}, address.city || ''),
      el('stat', {}, address.country || 'SK'),
      el('telefon', {}, company.phone || ''),
      el('email', {}, company.email || '')));
  const body = el('telo', {},
    ...form.rowOrder.map(row => el(row, {}, byRow.has(row) ? byRow.get(row) : null)),
    el('datumVyhlasenia', {}, ctx.today || ''));
  return toXml(el(form.rootElement, form.namespace ? { xmlns: form.namespace } : {}, header, body));
}
