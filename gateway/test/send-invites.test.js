import { describe, it, expect, vi } from 'vitest';
import { parseCsv, selectRecipients, sendInvites } from '../scripts/send-invites.mjs';
import { openDb } from '../src/lib/db.js';
import { loadConfig } from '../src/config.js';
import { createMailer } from '../src/mail/mailer.js';
import { verifyBetaToken } from '../src/waitlist/tokens.js';
import { createInvites } from '../src/waitlist/invites.js';

const CSV = 'email,lang,status,source\r\na@b.sk,sk,confirmed,"x, ""y"""\r\nc@d.cz,cs,pending,\r\nnot-an-email,en,confirmed,\r\n\r\ne@f.de,,confirmed,\r\n';

describe('send-invites', () => {
  it('parses the admin CSV and selects confirmed addresses', () => {
    const rows = parseCsv(CSV);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({ email: 'a@b.sk', lang: 'sk', status: 'confirmed', source: 'x, "y"' });
    expect(selectRecipients(rows)).toEqual([{ email: 'a@b.sk', lang: 'sk' }, { email: 'e@f.de', lang: 'sk' }]);
    expect(selectRecipients(rows, { all: true })).toHaveLength(3);
    expect(parseCsv('email\nX@Y.SK')).toEqual([{ email: 'X@Y.SK' }]);
  });

  it('creates codes and sends the invite in the right language', async () => {
    const config = loadConfig({ BETA_HMAC_SECRET: 's', SITE_URL: 'https://site.test' });
    const db = openDb(':memory:');
    const sendMail = vi.fn().mockResolvedValue({});
    const mailer = createMailer(config, { transport: { sendMail } });
    const out = { info: vi.fn() };
    const results = await sendInvites({ rows: parseCsv(CSV), config, db, mailer, all: true, out });
    expect(results).toHaveLength(3);
    expect(sendMail).toHaveBeenCalledTimes(3);
    expect(sendMail.mock.calls[1][0].subject).toBe('Jste v betě eFaktúra ve WE Invoice');
    expect(sendMail.mock.calls[0][0].text).toContain(results[0].code);
    expect(sendMail.mock.calls[0][0].text).toContain('https://site.test/app/');
    const { token } = createInvites(db, config).redeem(results[0].code);
    expect(verifyBetaToken('s', token)).toMatchObject({ code: results[0].code });
    const dry = await sendInvites({ rows: parseCsv(CSV), config, db, mailer, dryRun: true, out });
    expect(dry).toHaveLength(2);
    expect(sendMail).toHaveBeenCalledTimes(3);
    expect(dry[0].sent).toBe(false);
  });
});
