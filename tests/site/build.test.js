// The committed site is exactly what the templates and the texts produce:
// after editing site/content or site/build, run node site/build/build.js.
import { describe, it, expect } from 'vitest';
import { renderAll } from '../../site/build/render.js';
import { read, exists } from './helpers.js';

const files = renderAll();

describe('site build output', () => {
  it('produces the four pages of every language, the root pages, the sitemap and the apps block', () => {
    const paths = Object.keys(files);
    expect(paths.filter(p => /^site\/[a-z]{2}\/index\.html$/.test(p))).toHaveLength(6);
    expect(paths).toContain('site/index.html');
    expect(paths).toContain('site/404.html');
    expect(paths).toContain('site/sitemap.xml');
    expect(paths).toContain('site/robots.txt');
    expect(paths.filter(p => p.startsWith('docs/whiteeagles-apps-block/'))).toHaveLength(12);
  });

  it.each(Object.keys(files))('%s is committed as built', (path) => {
    expect(exists(path), `${path} is missing: run node site/build/build.js`).toBe(true);
    expect(read(path)).toBe(files[path]);
  });
});
