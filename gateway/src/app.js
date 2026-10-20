// Builds the Fastify app: security headers, CORS for the site and the dev
// server, rate limits, counters, then the routes. Everything with a side
// effect (database, HTTP dispatcher, DNS, mail transport) is injectable so
// tests run without the network.
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { loggerOptions } from './lib/logger.js';
import { installErrorHandler } from './lib/errors.js';
import { openDb } from './lib/db.js';
import { createCache } from './lib/cache.js';
import { createStats } from './lib/stats.js';
import { createUpstream } from './lib/upstream.js';
import { createGuardedAgent } from './lib/guarded-agent.js';
import { createMailer } from './mail/mailer.js';
import { createWaitlist } from './waitlist/service.js';
import { createInvites } from './waitlist/invites.js';
import healthRoutes from './routes/health.js';
import proxyRoutes from './routes/proxy.js';
import superfakturaRoutes from './routes/superfaktura.js';
import registerRoutes from './routes/registers.js';
import publicDataRoutes from './routes/public-data.js';
import waitlistRoutes from './routes/waitlist.js';
import betaRoutes from './routes/beta.js';
import adminRoutes from './routes/admin.js';

const SECURITY_HEADERS = {
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'x-frame-options': 'DENY',
  'cache-control': 'no-store'
};

const ALLOWED_HEADERS = ['Content-Type', 'Accept', 'Authorization', 'X-Upstream-Authorization', 'X-Upstream-Base', 'X-Peppol-Participant-Id', 'X-API-Key'];

// logger: true, false or {stream} (tests capture the output).
export async function buildApp(config, { logger = true, dispatcher, lookup, resolver, transport, db } = {}) {
  const app = Fastify({
    logger: logger ? loggerOptions(config.logLevel, logger.stream) : false,
    trustProxy: config.trustProxy,
    bodyLimit: 256 * 1024,
    requestTimeout: 120000
  });
  const database = db || openDb(config.databasePath);
  const stats = createStats(database);
  const cache = createCache(database);
  const upstream = createUpstream(config.upstream, { dispatcher, stats, log: app.log });
  const mailer = createMailer(config, { transport, log: app.log });
  const waitlist = createWaitlist(database, config);
  const invites = createInvites(database, config);
  const proxyDispatcher = dispatcher || createGuardedAgent({ timeoutMs: config.upstream.timeoutMs });

  app.addHook('onSend', async (request, reply, payload) => {
    reply.headers(SECURITY_HEADERS);
    return payload;
  });
  app.addHook('onResponse', async (request, reply) => {
    stats.record({ route: request.routeOptions && request.routeOptions.url, statusCode: reply.statusCode, durationMs: reply.elapsedTime, upstreamError: reply.statusCode === 502 });
  });
  installErrorHandler(app);

  await app.register(cors, { origin: config.corsOrigins, methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'], allowedHeaders: ALLOWED_HEADERS, maxAge: 86400 });
  if (config.rateLimitScale > 0) {
    app.addHook('onRoute', (route) => {
      if (route.config && route.config.rateLimit) route.config.rateLimit.max = Math.max(1, Math.round(route.config.rateLimit.max * config.rateLimitScale));
    });
    await app.register(rateLimit, { max: Math.round(120 * config.rateLimitScale), timeWindow: '1 minute', addHeadersOnExceeding: { 'x-ratelimit-limit': true, 'x-ratelimit-remaining': true } });
  }

  const deps = { config, upstream, cache, stats, waitlist, invites, mailer, lookup, resolver };
  await app.register(healthRoutes, deps);
  await app.register(proxyRoutes, { config, dispatcher: proxyDispatcher, lookup });
  await app.register(superfakturaRoutes, { config, dispatcher: proxyDispatcher, lookup });
  await app.register(registerRoutes, deps);
  await app.register(publicDataRoutes, deps);
  await app.register(waitlistRoutes, deps);
  await app.register(betaRoutes, deps);
  await app.register(adminRoutes, deps);

  // GDPR retention: expired pending records and records without activity.
  const purge = () => {
    const removed = waitlist.purge();
    if (removed) app.log.info({ removed }, 'waitlist records purged');
  };
  purge();
  const timer = setInterval(purge, 24 * 60 * 60 * 1000);
  timer.unref();
  app.addHook('onClose', async () => {
    clearInterval(timer);
    if (!dispatcher) await proxyDispatcher.close();
    if (!db) database.close();
  });
  app.decorate('deps', deps);
  return app;
}
