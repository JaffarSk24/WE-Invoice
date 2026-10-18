// Outbound HTTP client for public upstreams (RPO, ARES, VIES, ECB, FS,
// eKasa, SMP). One place for the timeout, the shared concurrency ceiling
// per upstream, the health counters and the mapping of every failure to
// 502 UPSTREAM_UNAVAILABLE. The dispatcher is injectable so tests use an
// undici MockAgent and never reach the network.
import { fetch as undiciFetch, Agent } from 'undici';
import { upstreamUnavailable, HttpError } from './errors.js';

// Minimal semaphore: at most `limit` callers inside at once, the rest wait.
export function createSemaphore(limit) {
  let active = 0;
  const queue = [];
  const release = () => {
    active--;
    const next = queue.shift();
    if (next) next();
  };
  return async function run(fn) {
    if (active >= limit) await new Promise(resolve => queue.push(resolve));
    active++;
    try {
      return await fn();
    } finally {
      release();
    }
  };
}

export function createUpstream(config, { dispatcher, stats, log } = {}) {
  const agent = dispatcher || new Agent({ connect: { timeout: config.timeoutMs } });
  const gates = new Map();
  const gate = (name) => {
    if (!gates.has(name)) gates.set(name, createSemaphore(config.maxConcurrent));
    return gates.get(name);
  };

  async function send(name, url, { method = 'GET', headers = {}, body, timeoutMs = config.timeoutMs } = {}) {
    return gate(name)(async () => {
      let response;
      try {
        response = await undiciFetch(url, { method, headers, body, dispatcher: agent, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
      } catch (e) {
        stats && stats.upstream(name, false);
        log && log.warn({ upstream: name, reason: e.name === 'TimeoutError' ? 'timeout' : e.code || e.message }, 'upstream failed');
        throw upstreamUnavailable(`${name} unavailable`);
      }
      const serverError = response.status >= 500;
      stats && stats.upstream(name, !serverError);
      if (serverError) {
        log && log.warn({ upstream: name, status: response.status }, 'upstream error');
        throw upstreamUnavailable(`${name} answered ${response.status}`);
      }
      return response;
    });
  }

  return {
    agent,
    send,
    // JSON answer; a 404 becomes NOT_FOUND, other 4xx upstream answers 502
    // because the gateway built the request and the user cannot fix it.
    async json(name, url, options = {}) {
      const response = await send(name, url, { ...options, headers: { accept: 'application/json', ...options.headers } });
      if (response.status === 404) throw new HttpError(404, 'NOT_FOUND', 'Not found');
      if (response.status === 429) throw upstreamUnavailable(`${name} rate limited`);
      if (!response.ok && !(options.okStatuses || []).includes(response.status)) throw upstreamUnavailable(`${name} answered ${response.status}`);
      try {
        return await response.json();
      } catch (e) {
        throw upstreamUnavailable(`${name} answered with invalid JSON`);
      }
    },
    async text(name, url, options = {}) {
      const response = await send(name, url, options);
      if (response.status === 404) throw new HttpError(404, 'NOT_FOUND', 'Not found');
      if (!response.ok) throw upstreamUnavailable(`${name} answered ${response.status}`);
      return response.text();
    }
  };
}
