// Start-up of the pdf module (WP-PDF): the PDF service other modules use
// through the event bus, so the document editor (WP-SALES) never imports
// pdf internals. A request carries the data and two callbacks:
//
//   emit('pdf:build',    { document, company, options, done(blob), fail(error) })
//   emit('pdf:download', { document, company, options, done(name), fail(error) })
//       builds the PDF and saves it through transport.files.saveAs under
//       the company's file mask; a toast confirms the name
//   emit('pdf:preview',  { document, company, options, done(url), fail(error) })
//       builds a draft preview (missing particulars allowed) and resolves
//       an object URL; the caller revokes it when the preview closes
//   emit('pdf:check',    { document, company, done(missingFields) })
//
// Every failure reaches the user as a toast (errors.<CODE>) and the
// console as the technical cause; fail() is called when given. The same
// API is importable directly from app/src/pdf/index.js. The module (with
// the payment QR library) loads on the first request, not at start.
const pdfModule = () => import('../pdf/index.js');

function run(ctx, request, work) {
  const done = typeof request.done === 'function' ? request.done : () => {};
  const fail = typeof request.fail === 'function' ? request.fail : () => {};
  return work()
    .then(result => done(result))
    .catch(e => {
      console.error('PDF request failed', e);
      ctx.showError(e, 'errors.PDF_RENDER_FAILED');
      fail(e);
    });
}

export async function boot(ctx) {
  ctx.on('pdf:build', (request) => run(ctx, request, async () => (await pdfModule()).buildPdf(request.document, request.company, request.options || {})));

  ctx.on('pdf:download', (request) => run(ctx, request, async () => {
    const options = request.options || {};
    const { buildPdf, pdfFileNameFor } = await pdfModule();
    const blob = await buildPdf(request.document, request.company, options);
    const name = pdfFileNameFor(request.document, request.company, options);
    await ctx.transport.files.saveAs(name, blob);
    ctx.showToast(ctx.t('pdf.toast.saved', { name }), { type: 'success' });
    return name;
  }));

  ctx.on('pdf:preview', (request) => run(ctx, request, async () => {
    const { buildPdf } = await pdfModule();
    const blob = await buildPdf(request.document, request.company, { allowIncomplete: true, ...(request.options || {}) });
    return URL.createObjectURL(blob);
  }));

  ctx.on('pdf:check', (request) => {
    if (typeof request.done !== 'function') return;
    pdfModule().then(m => request.done(m.missingRequisites(request.document, request.company)))
      .catch(e => { console.error('PDF check failed', e); ctx.showError(e, 'errors.PDF_RENDER_FAILED'); });
  });
}
