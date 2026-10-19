// Plural forms in dictionary texts, a small subset of the ICU message
// syntax: "{n, plural, one {# deň} few {# dni} other {# dní}}". The form is
// chosen by Intl.PluralRules of the language (Slovak, Czech, Russian and
// Ukrainian have three or four forms, English and German two); "#" stands
// for the number, and a missing form falls back to "other". Other
// placeholders inside a form ("{date}") are filled afterwards by t().

const rulesByLocale = new Map();

function pluralRules(locale) {
  if (!rulesByLocale.has(locale)) rulesByLocale.set(locale, new Intl.PluralRules(locale));
  return rulesByLocale.get(locale);
}

// The forms of one plural block: { one: '# deň', few: '# dni', other: '# dní' }.
function parseForms(body) {
  const forms = {};
  let i = 0;
  while (i < body.length) {
    const m = /^\s*(=\d+|zero|one|two|few|many|other)\s*\{/.exec(body.slice(i));
    if (!m) break;
    let depth = 1;
    let j = i + m[0].length;
    const start = j;
    while (j < body.length && depth) {
      if (body[j] === '{') depth += 1;
      else if (body[j] === '}') depth -= 1;
      j += 1;
    }
    forms[m[1]] = body.slice(start, j - 1);
    i = j;
  }
  return forms;
}

/** Replaces every plural block of a text by the form for its number. */
export function applyPlurals(text, params, locale) {
  if (!params || text.indexOf(', plural,') < 0) return text;
  let out = '';
  let i = 0;
  const open = /\{(\w+), plural,/g;
  let m;
  while ((m = open.exec(text))) {
    let depth = 1;
    let j = m.index + 1;
    while (j < text.length && depth) {
      j += 1;
      if (text[j] === '{') depth += 1;
      else if (text[j] === '}') depth -= 1;
    }
    const value = params[m[1]];
    const number = Number(value);
    const forms = parseForms(text.slice(m.index + m[0].length, j));
    let form = forms.other;
    if (value !== undefined && Number.isFinite(number)) {
      form = forms[`=${number}`] ?? forms[pluralRules(locale).select(number)] ?? forms.other;
    }
    out += text.slice(i, m.index) + (form === undefined ? text.slice(m.index, j + 1) : form.replace(/#/g, String(value ?? '#')));
    i = j + 1;
    open.lastIndex = i;
  }
  return out + text.slice(i);
}

/** The placeholder names of a text, plural blocks included: "n,date". */
export function placeholderNames(text) {
  const names = new Set();
  for (const m of String(text).matchAll(/\{(\w+)(?:\}|, plural,)/g)) names.add(m[1]);
  return [...names].sort().join(',');
}
