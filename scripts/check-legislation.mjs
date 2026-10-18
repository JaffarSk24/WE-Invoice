// Lists legislation values not yet verified against their source. Pull
// requests get a warning; a release (--strict) fails while any is left
// (08-desktop-web-release.md § 8.3).
import { readFileSync, readdirSync } from 'node:fs';

const strict = process.argv.includes('--strict');
const dir = new URL('../packages/core/legislation/', import.meta.url);
const unverified = [];
for (const file of readdirSync(dir).filter(f => f.endsWith('.json'))) {
  const data = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
  if (data.verified === false) unverified.push(file);
  for (const [key, value] of Object.entries(data)) {
    if (!Array.isArray(value)) continue;
    value.forEach((entry, i) => { if (entry && entry.verified === false) unverified.push(`${file}: ${key}[${i}]`); });
  }
}
if (unverified.length) {
  const say = strict ? '::error::' : '::warning::';
  console.log(`${say}${unverified.length} legislation values are not verified yet`);
  unverified.forEach(u => console.log(`  ${u}`));
  if (strict) process.exit(1);
} else {
  console.log('All legislation values are verified');
}
