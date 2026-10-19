// The page policy of the app (app/index.html, served as it is on the web
// and inside the desktop app): frames may load blob: URLs, so the PDF
// preview shows inside the app, and nothing else is loosened.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { cspAllowsBlobFrames } from './pdf-frame.js';

const html = readFileSync(new URL('../../../index.html', import.meta.url), 'utf8');
const policy = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
const directives = Object.fromEntries(policy.split(';').map(d => d.trim().split(/\s+/)).map(([name, ...values]) => [name, values]));

describe('content security policy', () => {
  it('lets frames load blob: URLs for the PDF preview', () => {
    expect(directives['frame-src']).toEqual(['blob:', 'https://accounts.google.com']);
    expect(cspAllowsBlobFrames(policy)).toBe(true);
  });

  it('keeps every other directive as strict as before', () => {
    expect(directives['default-src']).toEqual(["'self'"]);
    expect(directives['script-src']).toEqual(["'self'"]);
    expect(directives['worker-src']).toEqual(["'self'", 'blob:']);
    expect(directives['object-src']).toBeUndefined();
    expect(directives['child-src']).toBeUndefined();
    expect(Object.keys(directives).sort()).toEqual(['connect-src', 'default-src', 'font-src', 'frame-src', 'img-src', 'script-src', 'style-src', 'worker-src']);
  });
});
