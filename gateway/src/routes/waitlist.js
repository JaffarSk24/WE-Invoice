// Waitlist: POST /v1/waitlist (honeypot, fill-time check, then either the
// double opt-in e-mail or, by default, a direct sign-up with a notice to
// the owner), GET confirm and GET unsubscribe (redirects to the site). A
// bot-looking submission is answered like a real one and stored nowhere.
import { HttpError } from '../lib/errors.js';
import { localDateTime } from '../lib/time.js';
import { texts } from '../mail/texts/index.js';
import { LANGS, INTERESTS, normalizeEmail } from '../waitlist/service.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const BODY = {
  type: 'object',
  required: ['email', 'lang', 'consent'],
  properties: {
    email: { type: 'string', maxLength: 320 },
    lang: { type: 'string', enum: LANGS },
    consent: { type: 'boolean' },
    source: { type: 'string', maxLength: 60 },
    interests: { type: 'array', maxItems: 10, items: { type: 'string', enum: INTERESTS } },
    vatPayer: { type: ['boolean', 'null'] },
    website: { type: 'string', maxLength: 1000 },
    startedAt: { type: 'integer' }
  }
};

export function looksLikeBot(body, { now = Date.now(), minFillMs }) {
  if (body.website) return 'honeypot';
  if (body.startedAt !== undefined && now - body.startedAt < minFillMs) return 'too-fast';
  return null;
}

export default async function waitlistRoutes(app, { config, waitlist, mailer }) {
  // The owner learns about a sign-up by e-mail and can answer it directly
  // (Reply-To is the applicant). A failed notice never fails the sign-up.
  async function notifyOwner(request, fields) {
    if (!config.waitlist.ownerEmail) return;
    const counts = waitlist.counts();
    const words = (texts[config.waitlist.ownerLang] || texts.en).ownerNew || texts.en.ownerNew;
    const params = {
      email: fields.email, lang: fields.lang, interests: (fields.interests || []).join(', ') || '-',
      vatPayer: fields.vatPayer === true ? words.yes : fields.vatPayer === false ? words.no : '-',
      source: fields.source || '-', time: localDateTime(), total: Object.values(counts).reduce((a, b) => a + b, 0)
    };
    try {
      await mailer.send('ownerNew', config.waitlist.ownerLang, config.waitlist.ownerEmail, params, { replyTo: fields.email });
    } catch (e) {
      request.log.error({ reason: e.code || e.message }, 'owner notice failed');
    }
  }

  const redirect = (reply, page, lang) => reply.redirect(`${config.siteUrl}/${LANGS.includes(lang) ? lang : 'sk'}/${page}.html`, 302);

  app.post('/v1/waitlist', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    schema: { body: BODY }
  }, async (request, reply) => {
    const body = request.body;
    const email = normalizeEmail(body.email);
    if (!EMAIL.test(email)) throw new HttpError(400, 'INVALID_EMAIL', 'Invalid e-mail address');
    if (body.consent !== true) throw new HttpError(400, 'CONSENT_REQUIRED', 'Consent is required');
    const bot = looksLikeBot(body, { minFillMs: config.waitlist.minFillSeconds * 1000 });
    const direct = !config.waitlist.confirmByEmail;
    const accepted = { status: direct ? 'received' : 'pending' };
    if (bot) {
      request.log.warn({ reason: bot }, 'waitlist submission dropped');
      return reply.code(202).send(accepted);
    }
    const fields = { email, lang: body.lang, source: body.source, interests: body.interests, vatPayer: body.vatPayer };
    if (direct) {
      const { action } = waitlist.receive(fields);
      if (action === 'notify') await notifyOwner(request, fields);
      return reply.code(202).send(accepted);
    }
    const { record, action } = waitlist.subscribe(fields);
    if (action === 'mail') {
      try {
        await mailer.send('confirm', record.lang, record.email, {
          confirmUrl: `${config.publicUrl}/v1/waitlist/confirm?token=${record.confirm_token}`,
          unsubscribeUrl: `${config.publicUrl}/v1/waitlist/unsubscribe?token=${record.unsubscribe_token}`,
          hours: config.waitlist.confirmTtlHours
        });
      } catch (e) {
        request.log.error({ reason: e.code || e.message }, 'confirmation e-mail failed');
        throw new HttpError(503, 'MAIL_FAILED', 'Confirmation e-mail could not be sent, try again later');
      }
    }
    return reply.code(202).send({ status: 'pending' });
  });

  app.get('/v1/waitlist/confirm', {
    schema: { querystring: { type: 'object', required: ['token'], properties: { token: { type: 'string', minLength: 1, maxLength: 200 } } } }
  }, async (request, reply) => {
    const { result, record } = waitlist.confirm(request.query.token);
    if (result === 'confirmed' || result === 'already') return redirect(reply, 'thanks', record.lang);
    if (result === 'expired') throw new HttpError(400, 'TOKEN_EXPIRED', 'The confirmation link has expired, sign up again');
    throw new HttpError(400, 'INVALID_TOKEN', 'Invalid confirmation link');
  });

  app.get('/v1/waitlist/unsubscribe', {
    schema: { querystring: { type: 'object', required: ['token'], properties: { token: { type: 'string', minLength: 1, maxLength: 200 } } } }
  }, async (request, reply) => {
    const { result, record } = waitlist.unsubscribe(request.query.token);
    if (result === 'deleted') return redirect(reply, 'unsubscribed', record.lang);
    throw new HttpError(400, 'INVALID_TOKEN', 'Invalid unsubscribe link');
  });
}
