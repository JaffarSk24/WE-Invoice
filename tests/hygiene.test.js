// Repository hygiene (11-testing-qa.md § 11.5). The repository is public:
//   - no mention of code-generation tools anywhere, and the owner's local
//     notes (agent rules, the specification folder) are never published;
//   - no invisible characters or long dashes in sources;
//   - no secrets;
//   - no source file longer than the limit without a listed reason.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { repoFiles, TEXT_FILE } from './repo-files.js';

const files = repoFiles().filter(f => existsSync(f));
const textFiles = files.filter(f => TEXT_FILE.test(f) && f !== 'package-lock.json' && !f.endsWith('/package-lock.json'));

// Built from pieces so this file does not contain the words it looks for.
const w = (...parts) => parts.join('');
const TOOL_WORDS = [
  w('cla', 'ude'), w('anth', 'ropic'), w('open', 'ai'), w('chat', '-?', 'gpt'), w('co', 'pilot'),
  w('gem', 'ini'), w('cur', 'sor', '\\.', 'sh'), w('code', 'x cli'), w('l', 'lm')
];
const TOOL_MENTION = new RegExp(`\\b(${TOOL_WORDS.join('|')})\\b`, 'i');
const GENERATED_MARK = new RegExp(w('generated (with|by) ', '(a', 'i|an? ', 'a', 'i)'), 'i');
const COAUTHOR = new RegExp(w('co-', 'authored-', 'by'), 'i');

// eslint-disable-next-line no-misleading-character-class -- the class lists variation selectors on purpose
const INVISIBLE = /[\u00a0\u200b-\u200f\u2028\u2029\u202a-\u202f\u2060-\u2064\ufeff\u2013\u2014\ufe00-\ufe0f]|[\u{e0000}-\u{e007f}]/u;

const SECRETS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{30,}\b/,
  /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\bsk_live_[A-Za-z0-9]{10,}\b/,
  /\bvpt_[A-Za-z0-9]{16,}\b/,
  /\bxox[abpr]-[A-Za-z0-9-]{10,}\b/
];

const MAX_LINES = 300;
// Files allowed to be longer, with the reason.
const LONG_FILES = {
  'gateway/openapi.yaml': 'the API contract is one document',
  'packages/core/legislation/sk.json': 'legislation data',
  'app/src/i18n/sk.js': 'dictionary', 'app/src/i18n/en.js': 'dictionary', 'app/src/i18n/cs.js': 'dictionary',
  'app/src/i18n/de.js': 'dictionary', 'app/src/i18n/ru.js': 'dictionary', 'app/src/i18n/uk.js': 'dictionary'
};
const CODE_FILE = /\.(js|cjs|mjs|css)$/;

describe('repository hygiene', () => {
  it('does not publish local agent notes or the specification', () => {
    const local = new RegExp(w('(^|/)', TOOL_WORDS[0], '\\.md$|^docs/tz/|^\\.', TOOL_WORDS[0], '/'), 'i');
    const bad = files.filter(f => local.test(f));
    expect(bad).toEqual([]);
  });

  it('has no file names mentioning code-generation tools', () => {
    expect(files.filter(f => TOOL_MENTION.test(f))).toEqual([]);
  });

  it.each(textFiles)('%s is clean', (path) => {
    const lines = readFileSync(path, 'utf8').split('\n');
    const problems = [];
    lines.forEach((line, i) => {
      if (INVISIBLE.test(line)) problems.push(`${i + 1}: invisible character or long dash`);
      if (TOOL_MENTION.test(line) || GENERATED_MARK.test(line) || COAUTHOR.test(line)) problems.push(`${i + 1}: tool mention`);
      if (SECRETS.some(re => re.test(line))) problems.push(`${i + 1}: looks like a secret`);
    });
    if (CODE_FILE.test(path) && lines.length > MAX_LINES && !LONG_FILES[path]) problems.push(`${lines.length} lines (limit ${MAX_LINES})`);
    expect(problems).toEqual([]);
  });
});
