// XML of the súhrnný výkaz DPH: a header with the filer, the kind of
// filing and the period, and a body with one row per buyer VAT id and
// supply code. Element names follow the published form description; the
// layout is not yet validated against the official XSD file (see
// forms/sv.json and tests/fixtures/tax/xsd).
import { el, toXml } from './xml.js';
import { parsePeriod } from './periods.js';
import { splitStreet, companyVatId } from './forms.js';

export function svXml(sv, company, form, today) {
  const p = parsePeriod(sv.period);
  const address = company.address || {};
  const [street, number] = splitStreet(address.street);
  const header = el('hlavicka', {},
    el('icDph', {}, companyVatId(company)),
    el('druhVykazu', {}, el('rv', {}, sv.type === 'R' ? '1' : '0'), el('opv', {}, sv.type === 'O' ? '1' : '0')),
    el('obdobie', {},
      el('mesiac', {}, p.kind === 'MONTH' ? String(p.month) : ''),
      el('stvrtrok', {}, p.kind === 'QUARTER' ? String(p.quarter) : ''),
      el('rok', {}, String(p.year))),
    el('nazov', {}, company.name || ''),
    el('sidlo', {},
      el('ulica', {}, street),
      el('cislo', {}, number),
      el('psc', {}, String(address.zip || '').replace(/\s+/g, '')),
      el('obec', {}, address.city || ''),
      el('stat', {}, address.country || 'SK')),
    el('telefon', {}, company.phone || ''),
    el('email', {}, company.email || ''),
    el('datumVyplnenia', {}, today || ''));
  const body = el('telo', {},
    el('riadky', {}, ...sv.rows.map(r => el('riadok', {},
      el('kodStatu', {}, r.country),
      el('icDph', {}, r.number),
      el('hodnota', {}, r.value),
      el('kod', {}, r.code)))));
  return toXml(el(form.rootElement, form.namespace ? { xmlns: form.namespace } : {}, header, body));
}
