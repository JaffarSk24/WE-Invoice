// Steps 3 and 4 of the eFaktúra wizard: the provider keys with a
// connection test (sign in and one harmless read) that saves them only
// when it works, and the check that 0245:<DIČ> is registered in Peppol.
// Keys go to transport.secrets only; the screen shows at most their last
// four characters.
import { h, icon, append, clear } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { showToast, showError } from '../../ui/toast.js';
import { confirmDialog } from '../../ui/modal.js';
import { formatDateTime } from '../../components/dates.js';
import { participantId } from '@we-invoice/core';
import { credentialFields, hasSandbox, isConnectable, isValidCustomBase } from '../../peppol/providers.js';
import { openConnection } from '../../peppol/connection.js';
import { loadCredentials, saveCredentials, deleteCredentials, maskSecret } from '../../peppol/credentials.js';
import { lookupParticipant } from '../../peppol/lookup.js';
import { PeppolError } from '../../peppol/errors.js';
import { savePeppolSettings, stepCard } from './peppol-section-save.js';

// The translated text of an error, or the general one when it has none.
function errorLabel(error) {
  const key = `errors.${error && error.code}`;
  return t(key) === key ? t('errors.UNKNOWN') : t(key);
}

const LABELS = { clientId: 'peppol.connect.clientId', clientSecret: 'peppol.connect.clientSecret', apiKey: 'peppol.connect.apiKey' };

function credentialInputs(provider, demo) {
  return credentialFields(provider).map(field => {
    const id = `peppol-cred-${field}`;
    const input = h('input', { id, type: field === 'clientId' ? 'text' : 'password', autocomplete: 'off', spellcheck: 'false', disabled: demo, dataset: { field } });
    return { field, input, el: h('div', { class: 'field' }, h('label', { for: id }, t(LABELS[field])), input) };
  });
}

export function connectStep(ctx) {
  const provider = ctx.provider();
  const result = h('p', { class: 'peppol-result', 'aria-live': 'polite' });
  if (!provider || !isConnectable(provider)) return stepCard('connect', t('peppol.connect.title'), h('p', { class: 'muted' }, t('peppol.provider.notConnectable')));
  const inputs = credentialInputs(provider, ctx.demo);
  const sandbox = h('input', { type: 'checkbox', id: 'peppol-sandbox', checked: ctx.state.sandbox, disabled: ctx.demo || !hasSandbox(provider) });
  sandbox.addEventListener('change', () => { ctx.state.sandbox = sandbox.checked; });
  const storedLine = h('p', { class: 'muted small peppol-stored' });
  const testButton = h('button', { type: 'button', class: 'btn btn-primary', disabled: ctx.demo, dataset: { action: 'test-connection' } }, icon('plug'), t('peppol.connect.test'));
  const disconnect = h('button', { type: 'button', class: 'btn btn-ghost', hidden: !ctx.settings.enabled, disabled: ctx.demo, dataset: { action: 'disconnect' } }, t('peppol.connect.disconnect'));

  loadCredentials(ctx.transport, ctx.company.id, provider).then(stored => {
    if (stored && ctx.settings.providerId === provider.id) storedLine.textContent = t('peppol.connect.stored', { mask: maskSecret(stored.clientSecret || stored.apiKey) });
  }).catch(error => console.warn('peppol: stored key not readable', error.code || error.name));

  testButton.addEventListener('click', async () => {
    const values = Object.fromEntries(inputs.map(i => [i.field, i.input.value.trim()]));
    const customBase = provider.customBaseUrl ? ctx.state.baseUrl : null;
    if (provider.customBaseUrl && !isValidCustomBase(customBase)) return showError(new PeppolError('PEPPOL_NOT_CONFIGURED', 'custom base missing'));
    testButton.disabled = true;
    result.className = 'peppol-result';
    result.textContent = t('peppol.connect.testing');
    try {
      const fresh = inputs.every(i => i.input.value.trim());
      const credentials = fresh ? (values.apiKey ? { clientId: values.apiKey, clientSecret: values.apiKey, apiKey: values.apiKey } : values) : await loadCredentials(ctx.transport, ctx.company.id, provider);
      if (!credentials) throw new PeppolError('PEPPOL_NO_CREDENTIALS', 'no key entered');
      const settings = { providerId: provider.id, baseUrl: customBase, sandbox: ctx.state.sandbox, participantId: participantId(ctx.company.dic) };
      const connection = await openConnection({ transport: ctx.transport, company: ctx.company, settings, credentials });
      await connection.adapter.test();
      result.className = 'peppol-result is-ok';
      result.replaceChildren(icon('circle-check'), ' ', t('peppol.connect.ok'));
      refreshIcons(result);
      try {
        if (fresh) await saveCredentials(ctx.transport, ctx.company.id, provider, values);
        await savePeppolSettings({ ...settings, enabled: true, lastCheckAt: new Date().toISOString(), capabilities: connection.adapter.capabilities() });
      } catch (error) {
        // The key works but cannot be kept: the secrets are sealed with the data key of Drive.
        console.error('peppol: connection could not be saved', error.code || error.name);
        result.append(h('span', { class: 'peppol-save-error' }, ' ', error.code === 'LOCKED' ? t('peppol.connect.needsDrive') : errorLabel(error)));
        result.className = 'peppol-result is-wait';
        return;
      }
      showToast(t('peppol.connect.saved'), { type: 'success' });
      inputs.forEach(i => { i.input.value = ''; });
      disconnect.hidden = false;
    } catch (error) {
      result.className = 'peppol-result is-error';
      result.textContent = errorLabel(error);
      console.error('peppol: connection test failed', error.code || error.name, error.status || '');
    } finally {
      testButton.disabled = ctx.demo;
    }
  });

  disconnect.addEventListener('click', async () => {
    if (!(await confirmDialog(t('peppol.connect.disconnectConfirm'), { danger: true }))) return;
    try {
      await deleteCredentials(ctx.transport, ctx.company.id, provider.id);
      await savePeppolSettings({ enabled: false, capabilities: {} });
      showToast(t('peppol.connect.disconnected'), { type: 'success' });
      ctx.redraw();
    } catch (error) {
      showError(error);
    }
  });

  return stepCard('connect', t('peppol.connect.title'),
    h('p', { class: 'muted small' }, t('peppol.connect.participant', { id: participantId(ctx.company.dic) })),
    storedLine,
    h('div', { class: 'form-grid' }, inputs.map(i => i.el)),
    h('p', { class: 'field-hint' }, t('peppol.connect.secretHint')),
    hasSandbox(provider) ? h('label', { class: 'checkbox-label', for: 'peppol-sandbox' }, sandbox, ' ', t('peppol.connect.sandbox')) : null,
    hasSandbox(provider) ? h('p', { class: 'field-hint' }, t('peppol.connect.sandboxHint')) : null,
    h('div', { class: 'peppol-actions' }, testButton, disconnect),
    result,
    ctx.settings.enabled ? h('p', { class: 'muted small' }, t('peppol.connect.switchProvider')) : null);
}

export function lookupStep(ctx) {
  const result = h('p', { class: 'peppol-result', 'aria-live': 'polite' });
  const show = (registered, checkedAt) => {
    result.className = `peppol-result ${registered ? 'is-ok' : 'is-wait'}`;
    append(clear(result), [icon(registered ? 'circle-check' : 'hourglass'), ' ', t(registered ? 'peppol.lookup.registered' : 'peppol.lookup.notYet'),
      checkedAt ? h('span', { class: 'muted small' }, ` ${t('peppol.lookup.checkedAt', { date: formatDateTime(checkedAt) })}`) : null]);
    refreshIcons(result);
  };
  if (ctx.settings.registered !== null && ctx.settings.lastCheckAt) show(ctx.settings.registered, ctx.settings.lastCheckAt);
  const button = h('button', { type: 'button', class: 'btn', disabled: ctx.demo, dataset: { action: 'lookup' } }, icon('search'), t('peppol.lookup.check'));
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const found = await lookupParticipant(ctx.transport, ctx.company.dic);
      show(found.registered, found.checkedAt);
      await savePeppolSettings({ registered: found.registered, lastCheckAt: found.checkedAt }).catch(e => console.warn('peppol: lookup result not saved', e.code));
    } catch (error) {
      showError(error);
    } finally {
      button.disabled = ctx.demo;
    }
  });
  return stepCard('lookup', t('peppol.lookup.title'), button, result);
}
