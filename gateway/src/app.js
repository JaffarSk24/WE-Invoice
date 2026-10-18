// Builds the Fastify app. Routes are registered here; WP-GATEWAY adds the
// proxy, registers, VIES, rates, eKasa, Peppol lookup, waitlist and beta.
import Fastify from 'fastify';
import { loggerOptions } from './lib/logger.js';
import { installErrorHandler } from './lib/errors.js';
import healthRoutes from './routes/health.js';

const SECURITY_HEADERS = {
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'x-frame-options': 'DENY'
};

export async function buildApp(config, { logger = true } = {}) {
  const app = Fastify({
    logger: logger ? loggerOptions(process.env.LOG_LEVEL || 'info') : false,
    trustProxy: config.trustProxy,
    bodyLimit: 15 * 1024 * 1024,
    disableRequestLogging: false
  });
  app.addHook('onSend', async (request, reply, payload) => {
    reply.headers(SECURITY_HEADERS);
    return payload;
  });
  installErrorHandler(app);
  await app.register(healthRoutes, { config });
  return app;
}
