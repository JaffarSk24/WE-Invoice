// The app takes functions from the domain core by name. A namespace import
// of the core (import * as x) used with x[name] keeps every core module,
// with its data, in the start-up bundle: it once cost about 115 KB gzip.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { repoFiles } from './repo-files.js';

const sources = repoFiles().filter(f => f.startsWith('app/src/') && f.endsWith('.js') && !f.endsWith('.test.js') && existsSync(f));

describe('imports of the domain core', () => {
  it('never imports the whole core as a namespace', () => {
    const offenders = sources.filter(f => /import\s*\*\s*as\s+\w+\s+from\s+['"]@we-invoice\/core['"]/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
