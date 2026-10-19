// E-mail templates: the user's own (collection emailTemplates) and the
// defaults in the print dictionaries, one per purpose and print language.
// The best match wins: the user's template for the document kind, then
// the user's template for any kind, then the default. Placeholders such
// as {number} are filled by placeholders.js.
import { PRINT_DICTIONARIES } from '../pdf/labels.js';

export const PURPOSES = Object.freeze(['SEND', 'REMINDER_0', 'REMINDER_1', 'REMINDER_2', 'REMINDER_3', 'THANK_YOU']);
export const MAIL_LANGUAGES = Object.freeze(Object.keys(PRINT_DICTIONARIES));
export const PLACEHOLDERS = Object.freeze(['kind', 'number', 'company', 'contact', 'amount', 'amountDue', 'issueDate', 'dueDate', 'vs', 'iban', 'period', 'daysOverdue', 'penalties']);

export function mailLanguage(code) {
  return MAIL_LANGUAGES.includes(code) ? code : 'sk';
}

// The built-in template of a purpose in a print language.
export function defaultTemplate(purpose, language) {
  const lang = mailLanguage(language);
  const dict = PRINT_DICTIONARIES[lang];
  return {
    id: null, purpose, language: lang, docKind: null,
    subject: dict[`mail.${purpose}.subject`] ?? PRINT_DICTIONARIES.sk[`mail.${purpose}.subject`],
    body: dict[`mail.${purpose}.body`] ?? PRINT_DICTIONARIES.sk[`mail.${purpose}.body`]
  };
}

// The template to use; templates is the live list of the collection.
export function pickTemplate(templates, { purpose, language, docKind = null }) {
  const lang = mailLanguage(language);
  const mine = (templates || []).filter(x => !x.deleted && x.purpose === purpose && x.language === lang);
  return mine.find(x => docKind && x.docKind === docKind) || mine.find(x => !x.docKind) || defaultTemplate(purpose, lang);
}

// A print label in the mail language (titles of document kinds, penalty lines).
export function printText(language, key, params = null) {
  const lang = mailLanguage(language);
  const text = PRINT_DICTIONARIES[lang][key] ?? PRINT_DICTIONARIES.sk[key] ?? key;
  return params ? fill(text, params) : text;
}

// Replaces {name} with params[name]; unknown placeholders stay visible so
// a typo in a template is noticed before the e-mail goes out.
export function fill(text, params) {
  return String(text || '').replace(/\{(\w+)\}/g, (m, name) => (params[name] !== undefined && params[name] !== null ? String(params[name]) : m));
}
