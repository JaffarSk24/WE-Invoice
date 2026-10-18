import { describe, it, expect, vi } from 'vitest';
import { MockAgent } from 'undici';
import { createUpstream, createSemaphore } from '../src/lib/upstream.js';
import { createStats } from '../src/lib/stats.js';
import { openDb } from '../src/lib/db.js';

const config = { timeoutMs: 200, maxConcurrent: 2 };

function setup() {
  const agent = new MockAgent();
  agent.disableNetConnect();
  const stats = createStats(openDb(':memory:'));
  const log = { warn: vi.fn() };
  return { agent, stats, log, upstream: createUpstream(config, { dispatcher: agent, stats, log }), pool: agent.get('https://up.test') };
}

describe('upstream client', () => {
  it('returns json and marks the upstream healthy', async () => {
    const { upstream, pool, stats } = setup();
    pool.intercept({ path: '/a' }).reply(200, { ok: 1 }, { headers: { 'content-type': 'application/json' } });
    expect(await upstream.json('x', 'https://up.test/a')).toEqual({ ok: 1 });
    expect(stats.upstreamStatus()).toEqual({ x: 'ok' });
  });

  it('maps 5xx, network errors, timeouts, 429 and invalid json to 502', async () => {
    const { upstream, pool, stats, log } = setup();
    pool.intercept({ path: '/500' }).reply(503, 'down');
    await expect(upstream.json('x', 'https://up.test/500')).rejects.toMatchObject({ statusCode: 502, code: 'UPSTREAM_UNAVAILABLE' });
    expect(stats.upstreamStatus()).toEqual({ x: 'down' });
    pool.intercept({ path: '/net' }).replyWithError(new Error('ECONNRESET'));
    await expect(upstream.text('x', 'https://up.test/net')).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
    pool.intercept({ path: '/slow' }).reply(200, 'late').delay(500);
    await expect(upstream.text('x', 'https://up.test/slow')).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
    expect(log.warn.mock.calls.some(c => c[0].reason === 'timeout')).toBe(true);
    pool.intercept({ path: '/429' }).reply(429, 'slow down');
    await expect(upstream.json('x', 'https://up.test/429')).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
    pool.intercept({ path: '/bad' }).reply(200, 'not json');
    await expect(upstream.json('x', 'https://up.test/bad')).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
    pool.intercept({ path: '/403' }).reply(403, 'no');
    await expect(upstream.json('x', 'https://up.test/403')).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
    pool.intercept({ path: '/403t' }).reply(403, 'no');
    await expect(upstream.text('x', 'https://up.test/403t')).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
  });

  it('maps 404 to NOT_FOUND and allows listed statuses', async () => {
    const { upstream, pool } = setup();
    pool.intercept({ path: '/missing' }).reply(404, '');
    await expect(upstream.json('x', 'https://up.test/missing')).rejects.toMatchObject({ statusCode: 404 });
    pool.intercept({ path: '/missing-text' }).reply(404, '');
    await expect(upstream.text('x', 'https://up.test/missing-text')).rejects.toMatchObject({ statusCode: 404 });
    pool.intercept({ path: '/422', method: 'POST' }).reply(422, { error: 'x' }, { headers: { 'content-type': 'application/json' } });
    expect(await upstream.json('x', 'https://up.test/422', { method: 'POST', body: '{}', okStatuses: [422] })).toEqual({ error: 'x' });
  });

  it('works without stats and log and with the default agent', async () => {
    const upstream = createUpstream(config);
    expect(upstream.agent).toBeTruthy();
    await upstream.agent.close();
    const agent = new MockAgent();
    agent.disableNetConnect();
    agent.get('https://up.test').intercept({ path: '/t' }).reply(200, 'ok');
    expect(await createUpstream(config, { dispatcher: agent }).text('x', 'https://up.test/t')).toBe('ok');
    agent.get('https://up.test').intercept({ path: '/e' }).reply(500, '');
    await expect(createUpstream(config, { dispatcher: agent }).text('x', 'https://up.test/e')).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
    agent.get('https://up.test').intercept({ path: '/n' }).replyWithError(new Error('boom'));
    await expect(createUpstream(config, { dispatcher: agent }).text('x', 'https://up.test/n')).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
  });
});

describe('semaphore', () => {
  it('limits concurrency', async () => {
    const run = createSemaphore(2);
    let active = 0;
    let peak = 0;
    const task = () => run(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise(r => setTimeout(r, 10));
      active--;
      return 'done';
    });
    const results = await Promise.all([task(), task(), task(), task(), task()]);
    expect(results).toEqual(['done', 'done', 'done', 'done', 'done']);
    expect(peak).toBe(2);
    await expect(run(async () => { throw new Error('x'); })).rejects.toThrow('x');
  });
});
