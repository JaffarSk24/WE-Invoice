// Waitlist (09-site-waitlist-marketing.md § 9.2) in one of two modes.
// Double opt-in: a record is pending until the e-mail link is opened, the
// token expires, a second confirmation is harmless. Direct (the default,
// the owner's choice): a sign-up is "received" at once, no e-mail goes to
// the applicant and the owner writes to people personally. Unsubscribing
// deletes the record; records without activity are deleted after the
// retention period (GDPR).
import { randomToken } from './tokens.js';

export const LANGS = ['sk', 'cs', 'en', 'de', 'ru', 'uk'];
export const INTERESTS = ['efaktura-send', 'efaktura-receive', 'simple-bookkeeping', 'vat-reports'];

export const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

export function createWaitlist(db, config, { now = () => new Date() } = {}) {
  const byEmail = db.prepare('SELECT * FROM waitlist WHERE email = ?');
  const byConfirmToken = db.prepare('SELECT * FROM waitlist WHERE confirm_token = ?');
  const byUnsubscribeToken = db.prepare('SELECT * FROM waitlist WHERE unsubscribe_token = ?');
  const insert = db.prepare(`INSERT INTO waitlist (email, lang, status, source, interests, vat_payer, consent_at, confirm_token, confirm_expires_at, unsubscribe_token, last_activity_at)
    VALUES (@email, @lang, 'pending', @source, @interests, @vatPayer, @at, @confirmToken, @confirmExpiresAt, @unsubscribeToken, @at)`);
  const renew = db.prepare(`UPDATE waitlist SET lang = @lang, source = @source, interests = @interests, vat_payer = @vatPayer, consent_at = @at,
    confirm_token = @confirmToken, confirm_expires_at = @confirmExpiresAt, last_activity_at = @at WHERE email = @email`);
  const insertReceived = db.prepare(`INSERT INTO waitlist (email, lang, status, source, interests, vat_payer, consent_at, unsubscribe_token, last_activity_at)
    VALUES (@email, @lang, 'received', @source, @interests, @vatPayer, @at, @unsubscribeToken, @at)`);
  const renewReceived = db.prepare(`UPDATE waitlist SET lang = @lang, source = @source, interests = @interests, vat_payer = @vatPayer, consent_at = @at,
    status = CASE status WHEN 'confirmed' THEN 'confirmed' ELSE 'received' END, confirm_token = NULL, confirm_expires_at = NULL, last_activity_at = @at WHERE email = @email`);
  const confirmStmt = db.prepare("UPDATE waitlist SET status = 'confirmed', confirmed_at = @at, confirm_token = NULL, confirm_expires_at = NULL, last_activity_at = @at WHERE id = @id");
  const remove = db.prepare('DELETE FROM waitlist WHERE id = ?');
  const purgePending = db.prepare("DELETE FROM waitlist WHERE status = 'pending' AND confirm_expires_at < ?");
  const purgeStale = db.prepare('DELETE FROM waitlist WHERE last_activity_at < ?');
  const listAll = db.prepare('SELECT email, lang, status, source, interests, vat_payer AS vatPayer, consent_at AS consentAt, confirmed_at AS confirmedAt FROM waitlist ORDER BY consent_at');
  const count = db.prepare("SELECT status, COUNT(*) AS n FROM waitlist GROUP BY status");

  const ttlMs = config.waitlist.confirmTtlHours * 60 * 60 * 1000;

  // Direct mode: action "notify" for a new address (the owner gets a
  // notice), "none" when the address was already on the list.
  function receive({ email, lang, source, interests, vatPayer }) {
    const at = now().toISOString();
    const existing = byEmail.get(email);
    const fields = {
      email, lang, source: source || null, interests: JSON.stringify(interests || []),
      vatPayer: vatPayer === true ? 1 : vatPayer === false ? 0 : null, at,
      unsubscribeToken: existing ? existing.unsubscribe_token : randomToken()
    };
    if (existing) renewReceived.run(fields);
    else insertReceived.run(fields);
    return { record: byEmail.get(email), action: existing ? 'none' : 'notify' };
  }

  return {
    receive,
    // Creates or renews a pending record. Returns {record, action}: action
    // "mail" when a confirmation e-mail is due, "none" for an address that
    // is already confirmed (nothing is revealed to the caller either way).
    subscribe({ email, lang, source, interests, vatPayer }) {
      const at = now();
      const existing = byEmail.get(email);
      if (existing && existing.status === 'confirmed') return { record: existing, action: 'none' };
      const fields = {
        email, lang, source: source || null, interests: JSON.stringify(interests || []),
        vatPayer: vatPayer === true ? 1 : vatPayer === false ? 0 : null,
        at: at.toISOString(), confirmToken: randomToken(), confirmExpiresAt: new Date(at.getTime() + ttlMs).toISOString(),
        unsubscribeToken: existing ? existing.unsubscribe_token : randomToken()
      };
      if (existing) renew.run(fields);
      else insert.run(fields);
      return { record: byEmail.get(email), action: 'mail' };
    },
    // "confirmed" on success, "already" when the link is used again,
    // "expired" or "invalid" otherwise.
    confirm(token) {
      if (!token) return { result: 'invalid' };
      const record = byConfirmToken.get(token);
      if (!record) {
        return { result: 'invalid' };
      }
      if (record.status === 'confirmed') return { result: 'already', record };
      if (Date.parse(record.confirm_expires_at) < now().getTime()) return { result: 'expired', record };
      confirmStmt.run({ id: record.id, at: now().toISOString() });
      return { result: 'confirmed', record: byEmail.get(record.email) };
    },
    unsubscribe(token) {
      const record = token ? byUnsubscribeToken.get(token) : undefined;
      if (!record) return { result: 'invalid' };
      remove.run(record.id);
      return { result: 'deleted', record };
    },
    purge() {
      const t = now().getTime();
      const stale = new Date(t - config.waitlist.retentionMonths * 30.44 * 24 * 60 * 60 * 1000).toISOString();
      return purgePending.run(new Date(t - 7 * 24 * 60 * 60 * 1000).toISOString()).changes + purgeStale.run(stale).changes;
    },
    all: () => listAll.all().map(r => ({ ...r, interests: JSON.parse(r.interests || '[]'), vatPayer: r.vatPayer === null ? null : r.vatPayer === 1 })),
    counts: () => Object.fromEntries(count.all().map(r => [r.status, r.n]))
  };
}
