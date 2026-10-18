// When recurring invoices are made (02-architecture.md § 2.8): shortly
// after start, when another company opens, and whenever the desktop
// scheduler wakes the page (scheduler:recurring, hourly in the tray). One
// run at a time; the user learns what was made and what still waits to be
// sent ("3 faktúry čakajú na odoslanie").
import { t } from '../../i18n/index.js';
import { showToast, showError } from '../../ui/toast.js';
import { todayLocal } from '../../components/dates.js';
import { isDemo } from '../shell/demo-mode.js';
import { openStore, go } from '../contacts/source.js';
import { runRecurring } from './runner.js';

let running = null;

export function report(result, { transport } = {}) {
  if (result.created.length) {
    showToast(t('recurring.run.created', { n: result.created.length }), { type: 'success', actionLabel: t('recurring.run.open'), onAction: () => go('recurring') });
  }
  if (result.waiting.length) {
    const text = t('recurring.run.waiting', { n: result.waiting.length });
    showToast(text, { type: 'info', duration: 10000, actionLabel: t('recurring.run.open'), onAction: () => go('recurring') });
    if (transport && transport.platform !== 'web') transport.notify(t('nav.recurring'), text);
  }
  const codes = new Set(result.errors.map(e => e.code));
  if (codes.has('NO_SERIES')) showToast(t('recurring.run.noSeries'), { type: 'error', duration: 10000 });
  codes.delete('NO_SERIES');
  if (codes.size) showToast(t('recurring.run.issueFailed'), { type: 'error', duration: 10000 });
}

// Runs the due templates of the open company once; a call during a run
// waits for that run.
export function runDueRecurring({ transport, today = todayLocal(), quiet = false } = {}) {
  if (running) return running;
  const store = openStore();
  if (isDemo() || !store || store.readOnly) return Promise.resolve(null);
  const send = async (s, document, { copyToSelf = false } = {}) => {
    const mail = await import('../../mail/index.js');
    return mail.sendAutomatically({ store: s, document, transport, copyToSelf });
  };
  running = runRecurring({ store, today, send })
    .then(result => { if (!quiet || result.created.length) report(result, { transport }); return result; })
    .catch(e => { showError(e); return null; })
    .finally(() => { running = null; });
  return running;
}

export function startRecurringService(ctx) {
  const { transport } = ctx;
  let timer = null;
  const soon = (delay = 1500) => { clearTimeout(timer); timer = setTimeout(() => runDueRecurring({ transport, quiet: true }), delay); };
  ctx.on('company:switched', () => soon());
  ctx.on('scheduler:recurring', () => runDueRecurring({ transport, quiet: true }));
  soon(2500);
}
