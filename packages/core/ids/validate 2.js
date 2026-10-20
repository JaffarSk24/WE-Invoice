// Checks of business identifiers (03-features.md § 3.3 AC), WP-CORE:
// ICO checksum (SK and CZ), Slovak DIC, EU VAT id formats, IBAN mod-97 and
// the BIC of Slovak and Czech banks from the bank code inside the IBAN.
// Every check is a format check: whether the subject exists is a registry
// question for the gateway (RPO, ARES, VIES).
import bankCodes from './bank-codes.json' with { type: 'json' };
import formats from './vat-id-formats.json' with { type: 'json' };

const digitsOnly = (value) => String(value ?? '').replace(/\s/g, '');
const compact = (value) => String(value ?? '').replace(/[\s-]/g, '').toUpperCase();

/**
 * ICO checksum, the same mod-11 rule in Slovakia and the Czech Republic:
 * the first seven digits weighted 8..2, the eighth digit is the check.
 * Older six and seven digit numbers are padded with zeros on the left.
 * @returns {boolean}
 */
export function isValidIco(ico) {
  const raw = digitsOnly(ico);
  if (!/^\d{6,8}$/.test(raw)) return false;
  const s = raw.padStart(8, '0');
  let total = 0;
  for (let i = 0; i < 7; i++) total += Number(s[i]) * (8 - i);
  const check = (11 - (total % 11)) % 10;
  return Number(s[7]) === check;
}

/** Slovak DIC: 10 digits that form a number divisible by 11. @returns {boolean} */
export function isValidDic(dic) {
  const raw = digitsOnly(dic);
  if (!/^[1-9]\d{9}$/.test(raw)) return false;
  return mod(raw, 11) === 0;
}

/**
 * EU VAT id format by its country prefix: "SK2020123456", "CZ12345678",
 * "DE123456789". A Slovak number must also pass the DIC rule; a Czech one
 * with eight digits must pass the ICO checksum. A prefix of a country that
 * is not in the table fails.
 * @returns {boolean}
 */
export function isValidVatId(vatId) {
  const s = compact(vatId);
  const country = s.slice(0, 2);
  const rest = s.slice(2);
  const pattern = formats.vatId[country];
  if (!pattern || !new RegExp(`^(?:${pattern})$`).test(rest)) return false;
  if (country === 'SK') return isValidDic(rest);
  if (country === 'CZ' && rest.length === 8) return isValidIco(rest);
  return true;
}

/** Remainder of a long decimal string divided by n, without BigInt. */
function mod(digits, n) {
  let r = 0;
  for (const ch of digits) r = (r * 10 + Number(ch)) % n;
  return r;
}

/**
 * IBAN: country prefix, known length for the country when the table has
 * it, and the ISO 7064 mod-97 check. Spaces are ignored.
 * @returns {boolean}
 */
export function isValidIban(iban) {
  const s = compact(iban);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const expected = formats.ibanLengths[s.slice(0, 2)];
  if (expected && s.length !== expected) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  return mod(numeric, 97) === 1;
}

/**
 * BIC of a Slovak or Czech bank from the bank code in the IBAN (the four
 * digits after the check digits), or null for another country, an invalid
 * IBAN or an unknown code.
 * @returns {string|null}
 */
export function bicFromIban(iban) {
  const s = compact(iban);
  if (!isValidIban(s)) return null;
  const table = bankCodes[s.slice(0, 2)];
  if (!table) return null;
  const entry = table[s.slice(4, 8)];
  return entry ? entry.bic : null;
}

/** Name of the bank behind an IBAN, when the bank code is known. @returns {string|null} */
export function bankNameFromIban(iban) {
  const s = compact(iban);
  const entry = isValidIban(s) ? bankCodes[s.slice(0, 2)]?.[s.slice(4, 8)] : null;
  return entry ? entry.name : null;
}
