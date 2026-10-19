// XML of the súhrnný výkaz DPH, form SVDPHv20 (official XSD of form 471 of
// Finančná správa, see forms/sv.json):
//   dokument
//     hlavicka  identifikacneCislo (kodStatu, dic), danovyUrad,
//               druhSV (riadny, opravny, dodatocny), obdobie (mesiac,
//               stvrtrok, rok), obchodneMeno (riadok up to 4), adresa
//               (ulica, cislo, psc, obec, tel, email), celkovaHodnota,
//               konatel, konatelTel, konatelEmail, datumVyhlasenia (den,
//               mesiac, rok)
//     telo      strana per 12 records: zaznam (kodStatu, idCislo, hodnota,
//               kod); zaznamCast2 (transfers of call-off stock) is not
//               produced, the app has no such supplies
// Flags are "1" or "0".
import { el, toXml } from './xml.js';
import { parsePeriod } from './periods.js';
import { add } from '../money/index.js';
import { splitStreet, companyDic, amountText, nameLines } from './forms.js';

const flag = (on) => (on ? '1' : '0');

// A list filled up to `size` items with `filler`.
const padded = (list, size, filler) => [...list, ...Array.from({ length: Math.max(0, size - list.length) }, () => filler)];

function pages(rows, size) {
  const out = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

export function svXml(sv, company, form, today) {
  const p = parsePeriod(sv.period);
  const address = company.address || {};
  const [street, number] = splitStreet(address.street);
  const [y, m, d] = String(today || '').split('-');
  const total = sv.rows.reduce((acc, r) => add(acc, r.value), '0');
  const header = el('hlavicka', {},
    el('identifikacneCislo', {}, el('kodStatu', {}, 'SK'), el('dic', {}, companyDic(company))),
    el('danovyUrad', {}, ''),
    el('druhSV', {},
      el('riadny', {}, flag(sv.type === 'R')),
      el('opravny', {}, flag(sv.type === 'O')),
      el('dodatocny', {}, flag(sv.type === 'D'))),
    el('obdobie', {},
      el('mesiac', {}, p.kind === 'MONTH' ? String(p.month) : ''),
      el('stvrtrok', {}, p.kind === 'QUARTER' ? String(p.quarter) : ''),
      el('rok', {}, String(p.year))),
    el('obchodneMeno', {}, ...padded(nameLines(company.name, form.nameLines), form.nameLines, '').map(line => el('riadok', {}, line))),
    el('adresa', {},
      el('ulica', {}, street),
      el('cislo', {}, number),
      el('psc', {}, String(address.zip || '').replace(/\s+/g, '')),
      el('obec', {}, address.city || ''),
      el('tel', {}, company.phone || ''),
      el('email', {}, company.email || '')),
    el('celkovaHodnota', {}, amountText(total)),
    el('konatel', {}, company.name || ''),
    el('datumVyhlasenia', {}, el('den', {}, d || ''), el('mesiac', {}, m || ''), el('rok', {}, y || '')));
  // The schema wants every page full: twelve records of each part, the
  // unused ones empty; part 2 (call-off stock) is not used by the app.
  const size = form.recordsPerPage;
  const empty = { country: '', number: '', value: '', code: '' };
  const body = el('telo', {}, ...pages(sv.rows, size).map(page => el('strana', {},
    ...padded(page, size, empty).map(r => el('zaznam', {},
      el('kodStatu', {}, r.country),
      el('idCislo', {}, r.number),
      el('hodnota', {}, r.value),
      el('kod', {}, r.code))),
    ...Array.from({ length: size }, () => el('zaznamCast2', {},
      el('kodStatu', {}, ''), el('idCislo', {}, ''), el('idCislo2', {}, ''), el('vratenieTovaru', {}, ''), el('oprava', {}, ''))))));
  return toXml(el(form.rootElement, form.namespace ? { xmlns: form.namespace } : {}, header, body));
}
