// Turning cells of other programs into values of the data model: dates in
// the formats Slovak and Czech programs write, amounts with either decimal
// separator, identifiers with spaces and prefixes. A value that cannot be
// read becomes null; the importer decides whether that skips the record.
import { parseAmount } from '../money/index.js';

const pad = (n) => String(n).padStart(2, '0');

function validDay(y, m, d) {
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** "2026-09-01", "1.9.2026", "01. 09. 2026", "01/09/2026", "2026-09-01T10:00" -> "2026-09-01". */
export function readDate(value) {
  const s = String(value ?? '').trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T\s])/.exec(s);
  let y; let mo; let d;
  if (m) [y, mo, d] = [m[1], m[2], m[3]].map(Number);
  else if ((m = /^(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})(?:$|\s)/.exec(s))) [d, mo, y] = [m[1], m[2], m[3]].map(Number);
  else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:$|\s)/.exec(s))) [d, mo, y] = [m[1], m[2], m[3]].map(Number);
  else return null;
  return validDay(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
}

/**
 * The order of slash dates in one file: "MDY" when some date can only be
 * month/day/year (10/22/2026), else "DMY", the Slovak and Czech order.
 * iDoklad exports in the order of the account's locale.
 */
export function slashDateOrder(values) {
  let mdy = false;
  let dmy = false;
  for (const v of values) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:$|\s)/.exec(String(v ?? '').trim());
    if (!m) continue;
    if (Number(m[1]) > 12) dmy = true;
    if (Number(m[2]) > 12) mdy = true;
  }
  return mdy && !dmy ? 'MDY' : 'DMY';
}

/** A month/day/year slash date as YYYY-MM-DD; any other value unchanged. */
export function isoFromMdy(value) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:$|\s)/.exec(String(value ?? '').trim());
  return m ? readDate(`${m[3]}-${m[1]}-${m[2]}`) : value;
}

/** A decimal string or null. */
export function readAmount(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  return parseAmount(String(value).replace(/\u2212/g, '-'));
}

/** Digits of an IČO; null when there are none. */
export function readIco(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits ? digits : null;
}

/** A tax or VAT number without spaces, upper case. */
export function readTaxId(value) {
  const s = String(value ?? '').replace(/\s/g, '').toUpperCase();
  return s || null;
}

export function readText(value) {
  const s = String(value ?? '').trim();
  return s || null;
}

/** ISO 3166 alpha-2 from a code or a common Slovak, Czech or English name. */
const COUNTRIES = {
  slovensko: 'SK', slovakia: 'SK', 'slovenska republika': 'SK', 'slovenska republika (sr)': 'SK',
  cesko: 'CZ', 'ceska republika': 'CZ', czechia: 'CZ', 'czech republic': 'CZ',
  rakusko: 'AT', austria: 'AT', nemecko: 'DE', germany: 'DE', madarsko: 'HU', hungary: 'HU', polsko: 'PL', poland: 'PL'
};

export function normalizeKey(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function readCountry(value, fallback = 'SK') {
  const s = String(value ?? '').trim();
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  return COUNTRIES[normalizeKey(s)] || fallback;
}

/** "Hlavná 12, 811 01 Bratislava" style lines are kept as the street. */
export function readAddress({ street, city, zip, country }, fallbackCountry = 'SK') {
  return { street: readText(street) || '', city: readText(city) || '', zip: readText(zip) || '', country: readCountry(country, fallbackCountry) };
}

/** A VAT rate as a plain decimal string: "23 %", "23,00" -> "23". */
export function readRate(value) {
  const amount = readAmount(String(value ?? '').replace('%', ''));
  if (amount === null) return null;
  return amount.includes('.') ? amount.replace(/\.?0+$/, '') : amount;
}
