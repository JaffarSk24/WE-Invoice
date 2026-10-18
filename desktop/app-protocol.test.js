import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { resolveInRoot } = require('./app-protocol.cjs');

describe('app:// protocol', () => {
  const root = path.join('/tmp', 'dist');

  it('serves index.html for the root', () => {
    expect(resolveInRoot(root, '/')).toBe(path.join(root, 'index.html'));
  });

  it('refuses paths outside dist', () => {
    expect(resolveInRoot(root, '/../secret.txt')).toBe(null);
    expect(resolveInRoot(root, '/%2e%2e/secret.txt')).toBe(null);
  });

  it('serves files inside dist', () => {
    expect(resolveInRoot(root, '/assets/app.js')).toBe(path.join(root, 'assets', 'app.js'));
  });
});
