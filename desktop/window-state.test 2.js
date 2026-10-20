import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { fitBounds, readState, writeState, MIN_WIDTH, MIN_HEIGHT, DEFAULT_WIDTH, DEFAULT_HEIGHT } = require('./window-state.cjs');

const primary = { x: 0, y: 0, width: 1920, height: 1080 };
const second = { x: 1920, y: 0, width: 1440, height: 900 };

describe('window bounds', () => {
  it('keeps a saved window that is visible on a display', () => {
    expect(fitBounds({ x: 100, y: 50, width: 1200, height: 800 }, [primary, second])).toEqual({ x: 100, y: 50, width: 1200, height: 800, maximized: false });
    expect(fitBounds({ x: 2000, y: 20, width: 1100, height: 750, maximized: true }, [primary, second]).x).toBe(2000);
  });

  it('centres a window saved on a display that is gone', () => {
    const b = fitBounds({ x: 2000, y: 20, width: 1100, height: 750 }, [primary]);
    expect(b).toEqual({ x: 410, y: 165, width: 1100, height: 750, maximized: false });
  });

  it('never goes under the minimum size or over the display', () => {
    const b = fitBounds({ x: 0, y: 0, width: 300, height: 200 }, [primary]);
    expect(b.width).toBe(MIN_WIDTH);
    expect(b.height).toBe(MIN_HEIGHT);
    const big = fitBounds({ x: 0, y: 0, width: 9000, height: 9000 }, [primary]);
    expect(big.width).toBe(1920);
    expect(big.height).toBe(1080);
  });

  it('uses defaults without saved state', () => {
    const b = fitBounds(null, [primary]);
    expect(b.width).toBe(DEFAULT_WIDTH);
    expect(b.height).toBe(DEFAULT_HEIGHT);
    expect(b.x).toBe(Math.round((1920 - DEFAULT_WIDTH) / 2));
    expect(fitBounds({ x: 'a', y: null }, []).width).toBe(DEFAULT_WIDTH);
  });
});

describe('window state file', () => {
  it('round-trips and survives a broken file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'we-invoice-window-'));
    try {
      expect(readState(dir)).toBe(null);
      writeState(dir, { x: 1, y: 2, width: 1100, height: 800, maximized: false });
      expect(readState(dir)).toEqual({ x: 1, y: 2, width: 1100, height: 800, maximized: false });
      fs.writeFileSync(path.join(dir, 'window-state.json'), '{{', 'utf8');
      expect(readState(dir)).toBe(null);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
