// The timing helper of the performance tests: the best of a few runs after
// a warm-up, so one slow tick of the machine does not fail a budget.
import { performance } from 'node:perf_hooks';

export function best(fn, runs = 3) {
  fn();
  let min = Infinity;
  for (let i = 0; i < runs; i += 1) {
    const start = performance.now();
    fn();
    min = Math.min(min, performance.now() - start);
  }
  return min;
}

export function elapsed(fn) {
  const start = performance.now();
  fn();
  return performance.now() - start;
}
