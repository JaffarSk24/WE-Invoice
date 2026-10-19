// Start-up of the peppol module (WP-PEPPOL): registers its routes over the
// placeholders and starts its services. Called once, in the order of
// boot/index.js, after the language and the transport are ready.
//
// Events (the editor of WP-SALES uses them instead of importing peppol):
//   emit('peppol:send', { documentId })          send one e-invoice now
//   emit('peppol:sendMany', { documentIds })     send several, one after another
//   emit('peppol:receive')                       fetch received e-invoices now
//   on('peppol:status', { documentId, status })  every step of a sending:
//       VALIDATING, READY, SENDING, then ACCEPTED or DELIVERED, or INVALID,
//       FAILED (retried later when retryable), REJECTED (from delivery checks)
//   on('peppol:received', { documentId, warnings })  a stored received e-invoice
//
// Background work: a round (due retries, delivery checks, inbox when
// automatic receiving is on) at start, on company switch, every 5 minutes
// while the web app is visible, and at every desktop scheduler tick
// (scheduler:efaktury, every 15 minutes).
import { registerSettingsSection } from '../views/settings/registry.js';
import { setPeppolServiceLoader, getPeppolService } from '../peppol/runtime.js';
import { getStore, hasStore } from '../store/index.js';
import { isDemo } from '../views/shell/demo-mode.js';
import '../style/peppol.css';

const WEB_INTERVAL_MS = 5 * 60 * 1000;
const FIRST_ROUND_MS = 3000;

function lazyView(ctx, load) {
  return (root, route) => load().then(render => render(root, { transport: ctx.transport, route })).catch(error => {
    console.error('peppol: screen failed to load', error);
    ctx.showError(error);
  });
}

function reportSend(ctx, document) {
  const status = document?.peppol?.status;
  const number = document?.number || '';
  if (status === 'ACCEPTED' || status === 'DELIVERED') ctx.showToast(ctx.t('peppol.out.sent', { number }), { type: 'success' });
  else if (status === 'FAILED' && document.peppol.nextAttemptAt) ctx.showToast(ctx.t('peppol.out.failed', { number }), { type: 'info' });
  else if (status === 'FAILED') ctx.showError({ code: document.peppol.errors?.[0]?.code });
  else if (status === 'INVALID') ctx.showToast(ctx.t('peppol.out.invalid', { number }), { type: 'error' });
}

function reportRound(ctx, round) {
  for (const document of round.changed || []) {
    if (document.peppol?.status !== 'REJECTED') continue;
    const body = ctx.t('peppol.notify.rejectedBody', { number: document.number || '' });
    ctx.transport.notify(ctx.t('peppol.notify.rejectedTitle'), body);
    ctx.showToast(`${body} ${ctx.t('peppol.out.rejectedHint')}`, { type: 'error' });
  }
  const stored = round.received?.stored || 0;
  if (stored) ctx.transport.notify(ctx.t('peppol.notify.receivedTitle'), ctx.t('peppol.notify.receivedBody', { n: stored }));
}

export async function boot(ctx) {
  const { transport, on, emit, t, showToast, showError } = ctx;
  let loading = null;
  setPeppolServiceLoader(() => {
    if (!loading) {
      // The PDF module (with the payment QR library) loads together with
      // the service, not at start.
      loading = Promise.all([import('../peppol/service.js'), import('../pdf/index.js')]).then(([m, pdf]) => m.createPeppolService({
        getStore: () => (hasStore() ? getStore() : null), transport, emit, buildPdf: pdf.buildPdf, pdfName: pdf.pdfFileNameFor
      }));
      loading.catch(() => { loading = null; });
    }
    return loading;
  });
  const service = {
    send: (id) => getPeppolService().then(s => s.send(id)),
    sendMany: (ids) => getPeppolService().then(s => s.sendMany(ids)),
    receiveNow: () => getPeppolService().then(s => s.receiveNow()),
    tick: () => getPeppolService().then(s => s.tick())
  };

  ctx.registerRoute('efaktury-out', lazyView(ctx, () => import('../views/efaktury/out.js').then(m => m.renderOut)));
  ctx.registerRoute('efaktury-in', lazyView(ctx, () => import('../views/efaktury/in.js').then(m => m.renderIn)));
  let section = null;
  registerSettingsSection('peppol', (root, options) => {
    const draw = (render) => render(root, options);
    if (section) return draw(section);
    return import('../views/settings/peppol-section.js')
      .then(m => { section = m.createPeppolSection({ transport }); draw(section); })
      .catch(error => { console.error('peppol: settings failed to load', error); showError(error); });
  });

  const demoGuard = () => {
    if (!isDemo()) return false;
    showToast(t('peppol.demo.readOnly'), { type: 'info' });
    return true;
  };
  on('peppol:send', ({ documentId } = {}) => {
    if (!documentId || demoGuard()) return;
    service.send(documentId).then(document => reportSend(ctx, document)).catch(error => {
      showError(error);
      emit('peppol:status', { documentId, status: 'FAILED' });
    });
  });
  on('peppol:sendMany', ({ documentIds = [] } = {}) => {
    if (!documentIds.length || demoGuard()) return;
    service.sendMany(documentIds).catch(showError);
  });
  on('peppol:receive', () => {
    if (demoGuard()) return;
    service.receiveNow().catch(showError);
  });

  const round = () => {
    // Nothing to do (and no code to load) until a provider is connected.
    if (isDemo() || !hasStore() || !getStore().company()?.peppol?.enabled) return;
    service.tick().then(result => reportRound(ctx, result)).catch(error => console.warn('peppol: round failed', error));
  };
  on('scheduler:efaktury', round);
  on('company:switched', round);
  on('peppol:beta', round);
  setTimeout(round, FIRST_ROUND_MS);
  if (transport.platform === 'web') {
    setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') round();
    }, WEB_INTERVAL_MS);
  }
}
