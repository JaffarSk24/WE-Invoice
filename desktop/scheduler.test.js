import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { dueTasks, nextDueInMs, markRun, TASK_KINDS } = require('./scheduler-plan.cjs');
const { createScheduler, FIRST_CHECK_DELAY_MS, STATE_FILE } = require('./scheduler.cjs');

const MIN = 60 * 1000;

describe('scheduler plan', () => {
  it('runs everything at first start', () => {
    expect(dueTasks({}, 1000)).toEqual(['recurring', 'reminders', 'efaktury']);
    expect(TASK_KINDS).toEqual(['recurring', 'reminders', 'efaktury']);
  });

  it('wakes eFaktúry every 15 minutes and the rest hourly', () => {
    const t0 = 1_000_000;
    const runs = markRun({}, TASK_KINDS, t0);
    expect(dueTasks(runs, t0 + 14 * MIN)).toEqual([]);
    expect(dueTasks(runs, t0 + 15 * MIN)).toEqual(['efaktury']);
    expect(dueTasks(runs, t0 + 59 * MIN)).toEqual(['efaktury']);
    expect(dueTasks(runs, t0 + 60 * MIN)).toEqual(['recurring', 'reminders', 'efaktury']);
    expect(nextDueInMs(runs, t0 + 10 * MIN)).toBe(5 * MIN);
    expect(nextDueInMs({}, t0)).toBe(0);
  });

  it('leaves disabled tasks alone', () => {
    expect(dueTasks({}, 1, { disabled: ['efaktury'] })).toEqual(['recurring', 'reminders']);
  });
});

function setup({ send = vi.fn(() => true), start = 1_000_000 } = {}) {
  vi.useFakeTimers();
  vi.setSystemTime(start);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'we-invoice-scheduler-'));
  const scheduler = createScheduler({ userData: dir, send, now: () => Date.now() });
  return { scheduler, send, dir, done: () => { scheduler.stop(); vi.useRealTimers(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

describe('scheduler', () => {
  it('wakes the page for every task shortly after start, then on schedule', () => {
    const { scheduler, send, done } = setup();
    try {
      scheduler.start();
      expect(send).not.toHaveBeenCalled();
      vi.advanceTimersByTime(FIRST_CHECK_DELAY_MS);
      expect(send.mock.calls.map(c => c[0])).toEqual(['recurring', 'reminders', 'efaktury']);
      send.mockClear();
      // The clock is read once a minute: 15 minutes after the first run
      // falls between two checks, the next one wakes eFaktúry.
      vi.advanceTimersByTime(16 * MIN);
      expect(send.mock.calls.map(c => c[0])).toEqual(['efaktury']);
      send.mockClear();
      vi.advanceTimersByTime(45 * MIN);
      // eFaktúry at 31 and 46 minutes, then the hourly tasks at 61 minutes.
      expect(send.mock.calls.map(c => c[0])).toEqual(['efaktury', 'efaktury', 'recurring', 'reminders', 'efaktury']);
    } finally {
      done();
    }
  });

  it('keeps a task due while no page can take it', () => {
    const send = vi.fn(() => false);
    const { scheduler, dir, done } = setup({ send });
    try {
      scheduler.start();
      vi.advanceTimersByTime(FIRST_CHECK_DELAY_MS);
      expect(scheduler.state().lastRuns).toEqual({});
      expect(fs.existsSync(path.join(dir, STATE_FILE))).toBe(false);
      send.mockImplementation(() => true);
      vi.advanceTimersByTime(MIN);
      expect(Object.keys(scheduler.state().lastRuns).sort()).toEqual(['efaktury', 'recurring', 'reminders']);
      expect(JSON.parse(fs.readFileSync(path.join(dir, STATE_FILE), 'utf8')).lastRuns.efaktury).toBe(scheduler.state().lastRuns.efaktury);
    } finally {
      done();
    }
  });

  it('remembers runs across a restart and honours disabled tasks', () => {
    const first = setup();
    let dir;
    try {
      first.scheduler.start();
      vi.advanceTimersByTime(FIRST_CHECK_DELAY_MS);
      first.scheduler.setDisabled(['efaktury', 'bogus']);
      dir = first.dir;
      first.scheduler.stop();
      const send = vi.fn(() => true);
      const again = createScheduler({ userData: dir, send, now: () => Date.now() });
      expect(again.state().disabled).toEqual(['efaktury']);
      vi.advanceTimersByTime(20 * MIN);
      again.start();
      vi.advanceTimersByTime(FIRST_CHECK_DELAY_MS);
      // Only 20 minutes passed: nothing hourly is due, eFaktúry is off.
      expect(send).not.toHaveBeenCalled();
      expect(again.runNow('efaktury')).toEqual(['efaktury']);
      expect(again.runNow()).toEqual(['recurring', 'reminders']);
      again.stop();
    } finally {
      first.done();
    }
  });

  it('looks at the clock right after the computer wakes up', () => {
    const { scheduler, send, done } = setup();
    try {
      scheduler.start();
      vi.advanceTimersByTime(FIRST_CHECK_DELAY_MS);
      send.mockClear();
      vi.setSystemTime(Date.now() + 3 * 60 * MIN);
      expect(scheduler.resume()).toEqual(['recurring', 'reminders', 'efaktury']);
    } finally {
      done();
    }
  });
});
