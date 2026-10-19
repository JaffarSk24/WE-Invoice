// XML of the daňové priznanie k DPH, form DPHv25 (official XSD of form 616
// of Finančná správa, see forms/dph.json):
//   dokument
//     hlavicka  identifikacneCislo (kodStatu, cislo), dic, danovyUrad,
//               nevzniklaPov, typDP (rdp, odp, ddp, datumZisteniaDdp),
//               osoba (platitel, registrovana, inaPovinna, zdanitelna,
//               zastupca, zastupca69aa), zdanObd (mesiac, stvrtrok, rok),
//               meno (riadok up to 4), adresa (ulica, cislo, psc, obec,
//               telefon, email), opravnenaOsoba (menoPriezvisko, telefon,
//               email), datumVyhlasenia
//     telo      every row of forms/dph.json rowOrder in that order, empty
//               when the app has no amount for it
// Flags are "1" or "0"; dates are dd.mm.yyyy.
import { el, toXml } from './xml.js';
import { parsePeriod } from './periods.js';
import { splitStreet, companyVatId, companyDic, dateText, nameLines } from './forms.js';

const flag = (on) => (on ? '1' : '0');

export function vatReturnXml(vr, company, form, ctx = {}) {
  const p = parsePeriod(vr.period);
  const address = company.address || {};
  const [street, number] = splitStreet(address.street);
  const vatId = companyVatId(company);
  const byRow = new Map(vr.rows.map(r => [r.row, r.amount]));
  const header = el('hlavicka', {},
    el('identifikacneCislo', {}, el('kodStatu', {}, vatId.slice(0, 2) || 'SK'), el('cislo', {}, vatId.slice(2))),
    el('dic', {}, companyDic(company)),
    el('danovyUrad', {}, ''),
    el('nevzniklaPov', {}, '0'),
    el('typDP', {},
      el('rdp', {}, flag(vr.type === 'R')),
      el('odp', {}, flag(vr.type === 'O')),
      el('ddp', {}, flag(vr.type === 'D')),
      el('datumZisteniaDdp', {}, vr.type === 'D' ? dateText(ctx.discoveredOn) : '')),
    el('osoba', {},
      el('platitel', {}, flag(company.vatMode === 'PAYER')),
      el('registrovana', {}, flag(company.vatMode === 'REGISTERED_7')),
      el('inaPovinna', {}, '0'),
      el('zdanitelna', {}, '0'),
      el('zastupca', {}, '0'),
      el('zastupca69aa', {}, '0')),
    el('zdanObd', {},
      el('mesiac', {}, p.kind === 'MONTH' ? String(p.month) : ''),
      el('stvrtrok', {}, p.kind === 'QUARTER' ? String(p.quarter) : ''),
      el('rok', {}, String(p.year))),
    el('meno', {}, ...nameLines(company.name, form.nameLines).map(line => el('riadok', {}, line))),
    el('adresa', {},
      el('ulica', {}, street),
      el('cislo', {}, number),
      el('psc', {}, String(address.zip || '').replace(/\s+/g, '')),
      el('obec', {}, address.city || ''),
      el('telefon', {}, company.phone || ''),
      el('email', {}, company.email || '')),
    el('opravnenaOsoba', {}, el('menoPriezvisko', {}, ''), el('telefon', {}, ''), el('email', {}, '')),
    el('datumVyhlasenia', {}, dateText(ctx.today)));
  const body = el('telo', {}, ...form.rowOrder.map(row => el(row, {}, byRow.has(row) ? byRow.get(row) : null)));
  return toXml(el(form.rootElement, form.namespace ? { xmlns: form.namespace } : {}, header, body));
}
