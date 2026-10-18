// Checks commit messages, authors and branch names before they go public:
// English only, no mention of code-generation tools, no co-author trailers,
// no links to tool sessions, the owner's identity as author.
//   node scripts/check-commits.mjs [range]   default: origin/develop..HEAD
import { execSync, execFileSync } from 'node:child_process';

const range = process.argv[2] || 'origin/develop..HEAD';
const w = (...p) => p.join('');
const TOOLS = new RegExp(`\\b(${[w('cla', 'ude'), w('anth', 'ropic'), w('open', 'ai'), w('chat', '-?gpt'), w('co', 'pilot'), w('gem', 'ini'), w('l', 'lm')].join('|')})\\b`, 'i');
const TRAILER = new RegExp(w('co-', 'authored-', 'by'), 'i');
const GENERATED = new RegExp(w('generated (with|by)'), 'i');
const CYRILLIC = new RegExp(`[${String.fromCharCode(0x400)}-${String.fromCharCode(0x4ff)}]`);
const ALLOWED_AUTHOR = /^JaffarSk24 <JaffarSk24@users\.noreply\.github\.com>$/;

const log = execFileSync('git', ['log', '--format=%H%x1f%an <%ae>%x1f%cn <%ce>%x1f%B%x1e', range], { encoding: 'utf8' });
const problems = [];
for (const entry of log.split('\x1e').map(s => s.trim()).filter(Boolean)) {
  const [hash, author, committer, body] = entry.split('\x1f');
  const id = hash.slice(0, 8);
  if (!ALLOWED_AUTHOR.test(author)) problems.push(`${id}: author is "${author}"`);
  if (!ALLOWED_AUTHOR.test(committer)) problems.push(`${id}: committer is "${committer}"`);
  if (TOOLS.test(body) || GENERATED.test(body)) problems.push(`${id}: message mentions a tool`);
  if (TRAILER.test(body)) problems.push(`${id}: co-author trailer`);
  if (/https?:\/\/\S*(session_|\/code\/)/i.test(body)) problems.push(`${id}: link to a tool session`);
  if (CYRILLIC.test(body)) problems.push(`${id}: message is not in English`);
}
const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
if (TOOLS.test(branch)) problems.push(`branch name "${branch}" mentions a tool`);

if (problems.length) {
  console.error('Commit check failed:');
  problems.forEach(p => console.error(`  ${p}`));
  console.error('Fix with git commit --amend / git rebase -i before pushing.');
  process.exit(1);
}
console.log(`Commit check passed (${range})`);
