// The in-app guide as data, as src/help.js in WE Budget: every topic with
// its group, icon and the screen it belongs to. Texts are the i18n keys
// help.<id>.title, help.<id>.short and help.<id>.body. Pure functions, so
// the screen, the phone and the tests share one list and one search.
export const HELP_GROUPS = Object.freeze(['start', 'efaktura', 'documents', 'money', 'tax', 'safety']);

// view: the route the topic lives on; section: a Settings section.
// isNew: shown by the "What is new" filter.
export const TOPICS = Object.freeze([
  { id: 'start', group: 'start', icon: 'sparkles', view: 'dashboard' },
  { id: 'company', group: 'start', icon: 'building-2', view: 'settings', section: 'company' },
  { id: 'languageTheme', group: 'start', icon: 'palette', view: 'settings', section: 'interface' },
  { id: 'keyboard', group: 'start', icon: 'keyboard', view: 'dashboard' },
  { id: 'efaktura2027', group: 'efaktura', icon: 'send', view: 'efaktury-out', isNew: true },
  { id: 'provider', group: 'efaktura', icon: 'plug', view: 'settings', section: 'peppol', isNew: true },
  { id: 'invoices', group: 'documents', icon: 'file-text', view: 'invoices' },
  { id: 'statuses', group: 'documents', icon: 'circle-check', view: 'invoices' },
  { id: 'payments', group: 'money', icon: 'banknote', view: 'payments' },
  { id: 'bankImport', group: 'money', icon: 'landmark', view: 'bank' },
  { id: 'kv', group: 'tax', icon: 'file-spreadsheet', view: 'kv' },
  { id: 'vatThreshold', group: 'tax', icon: 'calculator', view: 'dashboard' },
  { id: 'encryption', group: 'safety', icon: 'lock', view: 'settings', section: 'sync' },
  { id: 'backup', group: 'safety', icon: 'archive', view: 'settings', section: 'exim' },
  { id: 'phone', group: 'safety', icon: 'smartphone', view: 'dashboard' }
]);

export function helpKeys(id) {
  return { title: `help.${id}.title`, short: `help.${id}.short`, body: `help.${id}.body` };
}

// Lower case without diacritics, so "kava" finds "Káva".
export function foldText(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function queryTokens(query) {
  return foldText(query).split(/\s+/).filter(Boolean);
}

export function topicText(topic, tr) {
  const k = helpKeys(topic.id);
  return foldText([tr(k.title), tr(k.short), tr(k.body)].join(' '));
}

// Every word of the query must be somewhere in the title, the short line
// or the body; case and diacritics do not matter.
export function matchesQuery(topic, query, tr) {
  const words = queryTokens(query);
  if (!words.length) return true;
  const text = topicText(topic, tr);
  return words.every(w => text.includes(w));
}

export function filterTopics(topics, { query = '', onlyNew = false } = {}, tr) {
  return topics.filter(f => (!onlyNew || f.isNew) && matchesQuery(f, query, tr));
}

export function groupTopics(topics) {
  return HELP_GROUPS
    .map(group => ({ group, topics: topics.filter(f => f.group === group) }))
    .filter(g => g.topics.length);
}

// A body is plain text: paragraphs separated by an empty line; a paragraph
// whose lines start with "- " is a list, "1. " a numbered list.
export function bodyBlocks(text) {
  return String(text || '').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean).map(block => {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.every(l => l.startsWith('- '))) return { type: 'ul', items: lines.map(l => l.slice(2).trim()) };
    if (lines.every(l => /^\d+\.\s/.test(l))) return { type: 'ol', items: lines.map(l => l.replace(/^\d+\.\s+/, '')) };
    return { type: 'p', text: lines.join(' ') };
  });
}
