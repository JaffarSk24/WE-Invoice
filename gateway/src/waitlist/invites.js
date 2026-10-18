// Beta invite codes: created by the owner's script, redeemed by the app
// for a signed token valid one year. A code may be redeemed a few times
// (the same person on a second device), never after it is revoked.
import { inviteCode, normalizeCode, signBetaToken } from './tokens.js';
import { HttpError } from '../lib/errors.js';

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export function createInvites(db, config, { now = () => new Date() } = {}) {
  const byCode = db.prepare('SELECT * FROM invites WHERE code = ?');
  const insert = db.prepare('INSERT INTO invites (code, email, created_at, max_uses) VALUES (?, ?, ?, ?)');
  const redeemStmt = db.prepare('UPDATE invites SET uses = uses + 1, last_redeemed_at = ? WHERE code = ?');
  const count = db.prepare('SELECT COUNT(*) AS total, SUM(CASE WHEN uses > 0 THEN 1 ELSE 0 END) AS redeemed FROM invites');

  return {
    create({ email = null, maxUses = 3 } = {}) {
      let code;
      do code = inviteCode(); while (byCode.get(code));
      insert.run(code, email, now().toISOString(), maxUses);
      return code;
    },
    redeem(input) {
      if (!config.betaHmacSecret) throw new HttpError(503, 'NOT_CONFIGURED', 'Beta is not configured');
      const code = normalizeCode(input);
      const row = byCode.get(code);
      if (!row || row.revoked_at) throw new HttpError(400, 'INVALID_CODE', 'Invalid invite code');
      if (row.uses >= row.max_uses) throw new HttpError(400, 'CODE_USED', 'Invite code already used');
      const at = now();
      redeemStmt.run(at.toISOString(), code);
      const expiresAt = new Date(at.getTime() + YEAR_MS).toISOString();
      return { token: signBetaToken(config.betaHmacSecret, { code, expiresAt }), expiresAt };
    },
    counts: () => {
      const row = count.get();
      return { total: row.total, redeemed: row.redeemed || 0 };
    }
  };
}
