// When reminders go out (02-architecture.md § 2.8): after start, when a
// company opens, and whenever the desktop scheduler wakes the page
// (scheduler:reminders). With automatic sending and an SMTP account the
// due reminders are sent; otherwise the user is told once a day how many
// wait on the reminders screen.
import { t } from '../../i18n/index.js';
import { showToast, showError } from '../../ui/toast.js';
import { getPrefs, setPref } from '../../prefs.js';
import { todayLocal } from '../../components/dates.js';
import { isDemo } from '../shell/demo-mode.js';
import { openStore, go } from '../contacts/source.js';
import { sendDueReminders } from './runner.js';

let running = null;

export async function sendWithMail({ store, document, purpose, penalties, transport }) {
  const mail = await import('../../mail/index.js');
  return mail.sendAutomatically({ store, document, purpose, penalties, transport });
}

export function runDueReminders({ transport, today = todayLocal(), force = false } = {}) {
  if (running) return running;
  const store = openStore();
  if (isDemo() || !store || store.readOnly) return Promise.resolve(null);
  running = sendDueReminders({ store, today, force, send: (input) => sendWithMail({ ...input, transport }) })
    .then(result => {
      if (result.sent) showToast(t('reminders.run.sent', { n: result.sent }), { type: 'success' });
      if (result.failed) showToast(t('reminders.run.failed', { n: result.failed }), { type: 'error' });
      if (result.waiting && getPrefs().remindersNotified !== today) {
        setPref('remindersNotified', today);
        showToast(t('reminders.run.waiting', { n: result.waiting }), { type: 'info', duration: 10000, actionLabel: t('recurring.run.open'), onAction: () => go('reminders') });
      }
      return result;
    })
    .catch(e => { showError(e); return null; })
    .finally(() => { running = null; });
  return running;
}

export function startReminderService(ctx) {
  const { transport } = ctx;
  let timer = null;
  const soon = (delay = 4000) => { clearTimeout(timer); timer = setTimeout(() => runDueReminders({ transport }), delay); };
  ctx.on('company:switched', () => soon());
  ctx.on('scheduler:reminders', () => runDueReminders({ transport }));
  soon(5000);
}
