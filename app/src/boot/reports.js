// Start-up of the reports module (WP-REPORTS): registers its routes over the
// placeholders and starts its services. Called once, in the order of
// boot/index.js, after the language and the transport are ready.
//
// Routes: reports, search (#/search?q=...), trash and audit (#/audit or
// #/audit/<record id>). Their screens load on first use (import()), so
// they add nothing to the start of the app. The change log recorder runs
// from the start; the Ctrl/Cmd+K dialog of the shell gets its results from
// the "search:query" provider below.
import { createAuditRecorder } from '../views/reports/audit-recorder.js';

function lazy(load, name, ctx) {
  return (root, route) => {
    load()
      .then(mod => { if (root.isConnected) mod[name](root, route); })
      .catch(e => ctx.showError(e));
  };
}

export async function boot(ctx) {
  ctx.registerRoute('reports', lazy(() => import('../views/reports/index.js'), 'renderReports', ctx));
  ctx.registerRoute('search', lazy(() => import('../views/search/index.js'), 'renderSearch', ctx));
  ctx.registerRoute('trash', lazy(() => import('../views/reports/trash.js'), 'renderTrash', ctx));
  ctx.registerRoute('audit', lazy(() => import('../views/reports/audit.js'), 'renderAudit', ctx));

  let palette = null;
  let latest = null;
  ctx.on('search:query', (payload) => {
    latest = payload;
    if (!palette) palette = import('../views/search/palette.js');
    palette
      .then(mod => { if (latest === payload) mod.handlePaletteQuery(payload); })
      .catch(e => console.error('Search could not start', e));
  });

  const recorder = createAuditRecorder({
    on: ctx.on,
    device: ctx.transport ? ctx.transport.platform : null,
    onError: (e) => ctx.showError(e, 'errors.AUDIT_WRITE_FAILED')
  });
  recorder.start();
}
