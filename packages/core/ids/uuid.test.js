import { describe, it, expect } from 'vitest';
import { uuidv7, UUID_V7 } from './uuid.js';

describe('uuidv7', () => {
  it('has the version 7 layout', () => {
    for (let i = 0; i < 100; i++) expect(uuidv7()).toMatch(UUID_V7);
  });

  it('starts with the timestamp, so ids sort by time', () => {
    const zero = new Uint8Array(10);
    const a = uuidv7(1_700_000_000_000, zero);
    const b = uuidv7(1_700_000_000_001, zero);
    expect(a < b).toBe(true);
    expect(a.slice(0, 13)).toBe('018bcfe5-6800');
  });

  it('is unique', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => uuidv7()));
    expect(ids.size).toBe(1000);
  });
});
