// Versions of the official forms (kontrolný výkaz, súhrnný výkaz, daňové
// priznanie k DPH): XML layout, row map and filling thresholds by validity
// date, kept as data in forms/*.json so a new form version is a data change.
// Also the formatting rules the XML files share: amounts with two decimals
// and a dot, rates without decimals.
import { CoreError } from '../errors.js';
import { round } from '../money/index.js';
import { validOn } from '../legislation/index.js';
import kv from './forms/kv.json' with { type: 'json' };
import sv from './forms/sv.json' with { type: 'json' };
import dph from './forms/dph.json' with { type: 'json' };

export const FORMS = Object.freeze({ kv, sv, dph });

/**
 * Version of a form valid for a period ending on `date`.
 * @param {'kv'|'sv'|'dph'} name
 * @param {string} date  YYYY-MM-DD, the first day of the period
 * @throws CoreError TAX_FORM_NOT_AVAILABLE
 */
export function formVersion(name, date) {
  const form = FORMS[name];
  const version = form && form.versions.find(v => validOn(v, date));
  if (!version) throw new CoreError('TAX_FORM_NOT_AVAILABLE', `no ${name} form for ${date}`);
  return version;
}

/** Paths of form versions not yet checked against the official schema. */
export function unverifiedForms() {
  return Object.entries(FORMS).flatMap(([name, form]) => form.versions.filter(v => v.verified !== true).map(v => `${name}/${v.form}/${v.validFrom}`));
}

/** "1234.5" -> "1234.50". */
export function amountText(value) {
  return round(value || '0', 2);
}

/** "23.00" -> "23"; "9.5" stays. */
export function rateText(value) {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value);
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/**
 * Street and house number of an address line: "Hlavná 12/A" -> ["Hlavná", "12/A"].
 * @returns {[string, string]}
 */
export function splitStreet(street) {
  const s = String(street || '').trim();
  const m = /^(.*?)[\s,]+(\d[\w/-]*)$/u.exec(s);
  return m ? [m[1].trim(), m[2]] : [s, ''];
}

/** The VAT id of the company without spaces, upper case. */
export function companyVatId(company) {
  return String((company && company.icDph) || '').replace(/\s+/g, '').toUpperCase();
}

/** "2026-04-10" -> "10.04.2026", the date format of the form headers. */
export function dateText(ymd) {
  if (!ymd) return '';
  const [y, m, d] = String(ymd).split('-');
  return `${d}.${m}.${y}`;
}

/**
 * A name split into at most `count` lines of at most `width` characters,
 * at spaces where possible: the "riadok" elements of the form headers.
 * @returns {string[]}
 */
export function nameLines(name, count = 4, width = 36) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    for (let rest = word; rest;) {
      const room = line ? width - line.length - 1 : width;
      if (rest.length <= room) {
        line = line ? `${line} ${rest}` : rest;
        rest = '';
      } else if (line) {
        lines.push(line);
        line = '';
      } else {
        lines.push(rest.slice(0, width));
        rest = rest.slice(width);
      }
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, count);
}

/** The DIČ of the company (10 digits). */
export function companyDic(company) {
  const dic = String((company && company.dic) || '').replace(/\s+/g, '');
  return dic || companyVatId(company).replace(/^[A-Z]{2}/, '');
}
