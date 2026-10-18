import { describe, it, expect } from 'vitest';
import { migrate, MIGRATIONS } from './index.js';

describe('migrate', () => {
  it('leaves current data as is', () => {
    const data = { schemaVersion: 1, x: 1 };
    expect(migrate(data, 1)).toEqual({ data, readOnly: false, migrated: false });
  });

  it('opens newer data read-only', () => {
    expect(migrate({ schemaVersion: 5 }, 1).readOnly).toBe(true);
  });

  it('refuses data without a version', () => {
    expect(() => migrate({}, 1)).toThrow(/Unknown schema version/);
  });

  it('fails loudly when a step is missing', () => {
    expect(MIGRATIONS.length).toBe(0);
    expect(() => migrate({ schemaVersion: 1 }, 2)).toThrow(/No migration from schema 1 to 2/);
  });
});
