// The options of the eFaktúra wizard: automatic receiving, the PDF
// attached to the e-invoice (company.defaults.attachPdfToEInvoice, on by
// default) and a copy by e-mail. eFaktúra is open to everyone: there is no
// invite code; the user's own provider is all it takes.
import { h } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { showToast, showError } from '../../ui/toast.js';
import { savePeppolSettings, saveCompanyDefaultsPatch, stepCard } from './peppol-section-save.js';

function checkbox(id, label, checked, disabled, onChange, hint = null) {
  const input = h('input', { type: 'checkbox', id, checked, disabled });
  input.addEventListener('change', () => onChange(input.checked).then(
    () => showToast(t('peppol.options.saved'), { type: 'success' }),
    (error) => { input.checked = !input.checked; showError(error); }));
  return h('div', { class: 'peppol-option' }, h('label', { class: 'checkbox-label', for: id }, input, ' ', label), hint ? h('p', { class: 'field-hint' }, hint) : null);
}

export function optionsStep(ctx) {
  const attach = ctx.company.defaults?.attachPdfToEInvoice !== false;
  return stepCard('options', t('peppol.options.title'),
    checkbox('peppol-auto-receive', t('peppol.options.autoReceive'), ctx.settings.autoReceive, ctx.demo, (on) => savePeppolSettings({ autoReceive: on }), t('peppol.options.autoReceiveHint')),
    checkbox('peppol-attach-pdf', t('peppol.options.attachPdf'), attach, ctx.demo, (on) => saveCompanyDefaultsPatch({ attachPdfToEInvoice: on })),
    checkbox('peppol-email-copy', t('peppol.options.emailCopy'), ctx.settings.emailCopy, ctx.demo, (on) => savePeppolSettings({ emailCopy: on })));
}
