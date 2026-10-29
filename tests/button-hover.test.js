// Filled buttons keep their fill on hover: a hover rule written for every
// .btn outranks .btn-primary (class plus pseudo-class against one class)
// and turned the white label of a primary button invisible on the light
// theme. Every hover rule of base.css that tints a .btn must leave the
// filled kinds out.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../app/src/style/base.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const FILLED = ['.btn-primary', '.btn-brand', '.btn-danger'];

describe('button hover', () => {
  const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim(), body }));

  it('never paints the background of a filled button on hover', () => {
    const tinting = rules.filter(r => /:hover/.test(r.selector) && /background/.test(r.body));
    expect(tinting.length).toBeGreaterThan(0);
    for (const rule of tinting) {
      for (const part of rule.selector.split(',').map(s => s.trim()).filter(s => s.startsWith('.btn'))) {
        for (const kind of FILLED) expect(part.includes(`:not(${kind})`), `${part} must leave out ${kind}`).toBe(true);
      }
    }
  });

  it('lightens a filled button on hover instead', () => {
    const lighten = rules.find(r => /filter:\s*brightness/.test(r.body));
    expect(lighten).toBeDefined();
    for (const kind of FILLED) expect(lighten.selector).toContain(`${kind}:not(:disabled):hover`);
  });
});
