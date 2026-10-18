// Owner's endpoints behind Bearer ADMIN_TOKEN: the waitlist as CSV and
// the counters. Without a configured token every call is refused.
import { HttpError } from '../lib/errors.js';
import { safeEqual } from '../waitlist/tokens.js';

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : Array.isArray(v) ? v.join(';') : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows) {
  const columns = ['email', 'lang', 'status', 'source', 'interests', 'vatPayer', 'consentAt', 'confirmedAt'];
  return [columns.join(','), ...rows.map(r => columns.map(c => csvCell(r[c])).join(','))].join('\r\n') + '\r\n';
}

export default async function adminRoutes(app, { config, waitlist, invites, stats }) {
  app.addHook('onRequest', async (request) => {
    const header = request.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!config.adminToken || !safeEqual(token, config.adminToken)) throw new HttpError(401, 'UNAUTHORIZED', 'Admin token required');
  });

  app.get('/v1/admin/waitlist.csv', async (request, reply) => {
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', 'attachment; filename="waitlist.csv"');
    reply.header('cache-control', 'no-store');
    return toCsv(waitlist.all());
  });

  app.get('/v1/admin/stats', async () => ({
    version: config.version,
    waitlist: waitlist.counts(),
    invites: invites.counts(),
    ...stats.snapshot()
  }));
}
