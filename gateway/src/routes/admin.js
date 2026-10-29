// The owner's endpoint behind Bearer ADMIN_TOKEN: the request counters,
// without personal data. Without a configured token every call is refused.
import { timingSafeEqual } from 'node:crypto';
import { HttpError } from '../lib/errors.js';

export function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

export default async function adminRoutes(app, { config, stats }) {
  app.addHook('onRequest', async (request) => {
    const header = request.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!config.adminToken || !safeEqual(token, config.adminToken)) throw new HttpError(401, 'UNAUTHORIZED', 'Admin token required');
  });

  app.get('/v1/admin/stats', async () => ({
    version: config.version,
    ...stats.snapshot()
  }));
}
