// Which background tasks are due (02-architecture.md § 2.8): recurring
// invoices and payment reminders once an hour and at start, receiving
// eFaktúry every 15 minutes. The main process only keeps time; the page
// does the work when it is woken. Pure, tested without Electron.

const MINUTE = 60 * 1000;

const TASKS = Object.freeze([
  { kind: 'recurring', intervalMs: 60 * MINUTE },
  { kind: 'reminders', intervalMs: 60 * MINUTE },
  { kind: 'efaktury', intervalMs: 15 * MINUTE }
]);

// How often the scheduler looks at the clock. Timers drift and sleep
// stretches them, so a short check beats one long timer per task.
const CHECK_EVERY_MS = MINUTE;

const TASK_KINDS = Object.freeze(TASKS.map(t => t.kind));

// The kinds whose interval has passed since their last run (never run
// counts as due). `lastRuns` maps kind to a timestamp in ms.
function dueTasks(lastRuns, now, { disabled = [] } = {}) {
  const runs = lastRuns || {};
  return TASKS
    .filter(t => !disabled.includes(t.kind))
    .filter(t => !Number.isFinite(runs[t.kind]) || now - runs[t.kind] >= t.intervalMs)
    .map(t => t.kind);
}

// Milliseconds until the next task is due, at least 0.
function nextDueInMs(lastRuns, now) {
  const runs = lastRuns || {};
  return Math.max(0, Math.min(...TASKS.map(t => (Number.isFinite(runs[t.kind]) ? runs[t.kind] + t.intervalMs - now : 0))));
}

function markRun(lastRuns, kinds, now) {
  const next = { ...(lastRuns || {}) };
  kinds.forEach(kind => { next[kind] = now; });
  return next;
}

module.exports = { TASKS, TASK_KINDS, CHECK_EVERY_MS, dueTasks, nextDueInMs, markRun };
