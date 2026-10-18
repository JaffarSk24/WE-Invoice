// The beta switch and the options of the eFaktúra wizard. The beta: an
// invite code exchanged at the gateway (web and desktop), or a device
// switch on the desktop. Options: automatic receiving, the PDF attached
// to the e-invoice (company.defaults.attachPdfToEInvoice, on by default)
// and a copy by e-mail.
import { h, icon } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { showToast, showError } from '../../ui/toast.js';
import { emit } from '../../events.js';
import { formatDate } from '../../components/dates.js';
import { betaState, redeemBetaCode, setDesktopBeta } from '../../peppol/beta.js';
import { savePeppolSettings, saveCompanyDefaultsPatch, stepCard } from './peppol-section-save.js';

export function betaStep(ctx) {
  const status = h('p', { class: 'peppol-result', 'aria-live': 'polite' });
  const input = h('input', { id: 'peppol-beta-code', type: 'text', autocomplete: 'off', maxlength: '40', disabled: ctx.demo });
  const button = h('button', { type: 'button', class: 'btn btn-primary', disabled: ctx.demo, dataset: { action: 'redeem' } }, t('peppol.beta.redeem'));
  const form = h('div', { class: 'peppol-beta-form' }, h('div', { class: 'field' }, h('label', { for: 'peppol-beta-code' }, t('peppol.beta.code')), input), button);
  const desktop = ctx.transport.platform !== 'web';
  const toggle = h('input', { type: 'checkbox', id: 'peppol-beta-desktop', disabled: ctx.demo });

  const show = (state) => {
    status.className = `peppol-result ${state.enabled ? 'is-ok' : ''}`.trim();
    status.replaceChildren(...(state.enabled
      ? [icon('circle-check'), ' ', state.via === 'desktop' ? t('peppol.beta.activeDesktop') : t('peppol.beta.active', { date: formatDate(String(state.expiresAt).slice(0, 10)) })]
      : [t('peppol.beta.text')]));
    form.hidden = state.enabled && state.via === 'code';
    toggle.checked = state.via === 'desktop';
    refreshIcons(status);
  };
  betaState(ctx.transport).then(show).catch(error => console.warn('peppol: beta state unknown', error.code || error.name));

  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      show(await redeemBetaCode(ctx.transport, input.value));
      input.value = '';
      showToast(t('peppol.beta.redeemed'), { type: 'success' });
      emit('peppol:beta', { enabled: true });
    } catch (error) {
      showError(error);
    } finally {
      button.disabled = ctx.demo;
    }
  });
  toggle.addEventListener('change', async () => {
    setDesktopBeta(toggle.checked);
    show(await betaState(ctx.transport));
    emit('peppol:beta', { enabled: toggle.checked });
  });

  return stepCard('beta', t('peppol.beta.title'), status, form,
    desktop ? h('label', { class: 'checkbox-label', for: 'peppol-beta-desktop' }, toggle, ' ', t('peppol.beta.desktopToggle')) : null,
    desktop ? h('p', { class: 'field-hint' }, t('peppol.beta.desktopHint')) : null);
}

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
