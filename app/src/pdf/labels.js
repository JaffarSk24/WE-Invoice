// Print labels: the legally exact field names of the printed document in
// the print languages (app/src/i18n/print/*.json), separate from the
// interface dictionaries. A bilingual document prints every label in two
// languages, "Dodávateľ / Supplier"; a label that reads the same in both
// (IBAN) is printed once.
import sk from '../i18n/print/sk.json';
import cs from '../i18n/print/cs.json';
import en from '../i18n/print/en.json';
import de from '../i18n/print/de.json';

export const PRINT_DICTIONARIES = Object.freeze({ sk, cs, en, de });
export const PRINT_LANGUAGES = Object.freeze(Object.keys(PRINT_DICTIONARIES));
export const BILINGUAL_SEPARATOR = ' / ';

export function printLanguage(code) {
  return PRINT_DICTIONARIES[code] ? code : 'sk';
}

function fill(text, params) {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, name) => (params[name] !== undefined ? String(params[name]) : m));
}

function lookup(language, key, params) {
  const dict = PRINT_DICTIONARIES[language];
  const text = (dict && dict[key]) ?? PRINT_DICTIONARIES.en[key] ?? key;
  return fill(text, params);
}

/**
 * @param {string} language  main print language
 * @param {string|null} [secondLanguage]  second language of a bilingual document
 * @returns {{L: Function, one: Function, language: string, secondLanguage: string|null, bilingual: boolean}}
 *   L(key, params)   label in one or two languages
 *   one(key, params) label in the main language only (file names, metadata)
 */
export function printLabels(language, secondLanguage = null) {
  const main = printLanguage(language);
  const second = secondLanguage && PRINT_DICTIONARIES[secondLanguage] && secondLanguage !== main ? secondLanguage : null;
  const one = (key, params) => lookup(main, key, params);
  const L = (key, params) => {
    const first = one(key, params);
    if (!second) return first;
    const other = lookup(second, key, params);
    return other === first ? first : `${first}${BILINGUAL_SEPARATOR}${other}`;
  };
  // A text in each language (for legal notes that come from legislation).
  const pair = (byLanguage) => {
    const first = byLanguage[main] || byLanguage.sk || '';
    const other = second ? (byLanguage[second] || byLanguage.en || '') : '';
    return other && other !== first ? `${first}${BILINGUAL_SEPARATOR}${other}` : first;
  };
  return { L, one, pair, language: main, secondLanguage: second, bilingual: Boolean(second) };
}
