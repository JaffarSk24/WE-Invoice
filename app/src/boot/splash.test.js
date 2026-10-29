// @vitest-environment happy-dom
// The start screen: the bar moves with the start and the line says the step.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootStep } from './splash.js';
import { bootModules, MODULES } from './index.js';

beforeEach(() => {
  document.body.innerHTML = '<div id="app"><div id="boot-splash"><div id="boot-bar"></div><p id="boot-step"></p></div></div>';
});

describe('start screen', () => {
  it('moves the bar and names the step, and does nothing once the app is drawn', () => {
    bootStep(0.4, 'Syncing with Google Drive…');
    expect(document.getElementById('boot-bar').style.width).toBe('40%');
    expect(document.getElementById('boot-step').textContent).toBe('Syncing with Google Drive…');
    bootStep(2);
    expect(document.getElementById('boot-bar').style.width).toBe('100%');
    expect(document.getElementById('boot-step').textContent).toBe('Syncing with Google Drive…');
    document.body.innerHTML = '<div id="app"></div>';
    expect(() => bootStep(0.9, 'x')).not.toThrow();
  });

  it('is part of index.html, so it shows before any script runs', () => {
    const html = readFileSync(join(process.cwd(), 'app/index.html'), 'utf8');
    expect(html).toMatch(/<div id="app">\s*<div class="boot-splash" id="boot-splash"/);
    expect(html).toContain('id="boot-bar"');
    expect(html).toContain('id="boot-step"');
  });

  it('reports the progress after every module, a failing one included', async () => {
    const seen = [];
    const mods = MODULES.length;
    await bootModules({}, () => {}, (done, total) => seen.push([done, total])).catch(() => {});
    expect(seen).toHaveLength(mods);
    expect(seen.at(-1)).toEqual([mods, mods]);
  });
});
