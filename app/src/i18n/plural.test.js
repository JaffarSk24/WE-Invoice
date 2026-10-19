// Plural forms in dictionary texts, chosen by the rules of each language.
import { describe, it, expect } from 'vitest';
import { applyPlurals, placeholderNames } from './plural.js';

const SK = 'o {n, plural, one {# deň} few {# dni} other {# dní}}';
const RU = '{n, plural, one {# документ} few {# документа} many {# документов} other {# документа}}';

describe('plural forms', () => {
  it('picks the Slovak form by the number', () => {
    expect([0, 1, 2, 4, 5, 21].map(n => applyPlurals(SK, { n }, 'sk-SK'))).toEqual(['o 0 dní', 'o 1 deň', 'o 2 dni', 'o 4 dni', 'o 5 dní', 'o 21 dní']);
  });

  it('picks the Russian form, including 21 and fractions', () => {
    expect([1, 3, 5, 11, 21, 22, 1.5].map(n => applyPlurals(RU, { n }, 'ru-RU')))
      .toEqual(['1 документ', '3 документа', '5 документов', '11 документов', '21 документ', '22 документа', '1.5 документа']);
  });

  it('keeps other placeholders, exact matches and missing values', () => {
    expect(applyPlurals('{n, plural, =0 {nič} one {# položka k {date}} other {# položiek k {date}}}', { n: 1 }, 'sk-SK')).toBe('1 položka k {date}');
    expect(applyPlurals('{n, plural, =0 {nič} other {# položiek}}', { n: 0 }, 'sk-SK')).toBe('nič');
    expect(applyPlurals('{n, plural, one {# day} other {# days}}', { m: 1 }, 'en-GB')).toBe('# days');
    expect(applyPlurals('Bez čísla {n}', { n: 2 }, 'sk-SK')).toBe('Bez čísla {n}');
  });

  it('names the placeholders of plural and plain texts alike', () => {
    expect(placeholderNames('{n, plural, one {# deň k {date}} other {# dní k {date}}}')).toBe('date,n');
    expect(placeholderNames('{n} days to {date}')).toBe('date,n');
  });
});
