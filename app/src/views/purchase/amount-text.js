// An amount for an input field with two decimals in the user's language
// ("221,40"), which the shared toInputText would shorten to "221,4".
import { round } from '@we-invoice/core';
import { currentLang } from '../../i18n/index.js';
import { decimalOf } from '../../i18n/languages.js';

export function amountText(value, lang = currentLang()) {
  if (value === null || value === undefined || value === '') return '';
  const fixed = round(value, 2);
  return decimalOf(lang) === ',' ? fixed.replace('.', ',') : fixed;
}
