#!/usr/bin/env node
// Beta invitations, run by hand by the owner on the server: reads a CSV
// (the admin export or any file with email and lang columns), creates an
// invite code per address in the gateway database and sends the "you are
// in the beta" e-mail in the person's language.
//   node --env-file=.env scripts/send-invites.mjs waitlist.csv [--dry-run] [--all] [--max-uses=3]
// Without --all only confirmed addresses are invited. --dry-run creates
// and prints codes without sending e-mail.
import { readFileSync } from 'node:fs';
import { loadConfig } from '../src/config.js';
import { openDb } from '../src/lib/db.js';
import { createInvites } from '../src/waitlist/invites.js';
import { createMailer } from '../src/mail/mailer.js';

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [header, ...body] = rows.filter(r => r.some(v => v !== ''));
  return body.map(r => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] || '').trim()])));
}

export function selectRecipients(rows, { all = false } = {}) {
  return rows
    .filter(r => r.email && r.email.includes('@'))
    .filter(r => all || !r.status || r.status === 'confirmed')
    .map(r => ({ email: r.email.toLowerCase(), lang: r.lang || 'sk' }));
}

export async function sendInvites({ rows, config, db, mailer, dryRun = false, all = false, maxUses = 3, out = console }) {
  const invites = createInvites(db, config);
  const recipients = selectRecipients(rows, { all });
  const results = [];
  for (const { email, lang } of recipients) {
    const code = invites.create({ email, maxUses });
    let sent = false;
    if (!dryRun) {
      await mailer.send('invite', lang, email, { code, appUrl: `${config.siteUrl}/app/`, unsubscribeUrl: `${config.siteUrl}/waitlist/` });
      sent = true;
    }
    results.push({ email, lang, code, sent });
    out.info(`${email},${lang},${code},${sent ? 'sent' : 'not sent'}`);
  }
  return results;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const args = process.argv.slice(2);
  const file = args.find(a => !a.startsWith('--'));
  if (!file) {
    console.error('usage: node --env-file=.env scripts/send-invites.mjs <waitlist.csv> [--dry-run] [--all] [--max-uses=3]');
    process.exit(2);
  }
  const config = loadConfig();
  if (!config.betaHmacSecret) {
    console.error('BETA_HMAC_SECRET is not set; codes could not be redeemed');
    process.exit(2);
  }
  const dryRun = args.includes('--dry-run');
  const maxUses = Number((args.find(a => a.startsWith('--max-uses=')) || '--max-uses=3').split('=')[1]);
  const mailer = createMailer(config, { log: console });
  if (!dryRun && !mailer.configured) {
    console.error('SMTP is not configured; use --dry-run to only create codes');
    process.exit(2);
  }
  const db = openDb(config.databasePath);
  const rows = parseCsv(readFileSync(file, 'utf8'));
  const results = await sendInvites({ rows, config, db, mailer, dryRun, all: args.includes('--all'), maxUses });
  db.close();
  console.info(`${results.length} invitation(s) ${dryRun ? 'prepared' : 'sent'}`);
}
