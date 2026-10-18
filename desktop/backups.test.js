import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { localDayStamp, localTimeStamp, dailyBackupName, taggedBackupName, isDailyBackup, dailyBackupsToDelete } = require('./backups.cjs');

describe('backup names', () => {
  it('use the local calendar day, not UTC', () => {
    // 23:30 local on 5 March: in UTC+1 that is still 5 March.
    const evening = new Date(2026, 2, 5, 23, 30, 0);
    expect(localDayStamp(evening)).toBe('2026-03-05');
    expect(dailyBackupName(evening)).toBe('we-invoice-data-2026-03-05.json');
  });

  it('carry the local time in tagged copies', () => {
    const at = new Date(2026, 0, 9, 7, 5, 3);
    expect(localTimeStamp(at)).toBe('2026-01-09_07-05-03');
    expect(taggedBackupName('premerge', at)).toBe('we-invoice-data-premerge-2026-01-09_07-05-03.json');
  });

  it('refuse unknown tags', () => {
    expect(() => taggedBackupName('anything')).toThrow();
  });

  it('tell daily copies from tagged ones', () => {
    expect(isDailyBackup('we-invoice-data-2026-03-05.json')).toBe(true);
    expect(isDailyBackup('we-invoice-data-premerge-2026-03-05_10-00-00.json')).toBe(false);
    expect(isDailyBackup('other-2026-03-05.json')).toBe(false);
  });
});

describe('backup rotation', () => {
  const daily = (d) => `we-invoice-data-2026-01-${String(d).padStart(2, '0')}.json`;

  it('deletes the oldest daily copies beyond the limit', () => {
    const names = [daily(3), daily(1), daily(2), daily(5), daily(4), 'we-invoice-data-cloud-2026-01-01_00-00-00.json'];
    expect(dailyBackupsToDelete(names, 3)).toEqual([daily(1), daily(2)]);
  });

  it('keeps everything under the limit and never touches tagged copies', () => {
    expect(dailyBackupsToDelete([daily(1), 'we-invoice-data-before-replace-2026-01-01_00-00-00.json'], 14)).toEqual([]);
    expect(dailyBackupsToDelete([], 14)).toEqual([]);
  });
});
