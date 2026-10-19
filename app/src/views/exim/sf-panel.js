// "SuperFaktúra cez API": the e-mail and the API key of the user's
// SuperFaktúra account (Nástroje, API), optionally kept on this device in
// transport.secrets, never in the company data or the console. Clients,
// the price list and the invoices are downloaded page by page with a
// progress line and can be stopped; what came is handed to the import
// preview like any file.
import { h, append, clear, selectEl } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { getTransport } from '../../transport/index.js';
import { sfAuthorization, importSuperfakturaApi, SF_MARKETS } from '../../../../packages/core/imports/superfaktura-api.js';
import { createSfClient, fetchSuperfaktura } from './sf-client.js';
import { errorText } from './labels.js';

export const secretName = (companyId) => `exim:superfaktura:${companyId || 'default'}`;

async function loadSaved(transport, companyId) {
  try {
    const raw = await transport.secrets.get(secretName(companyId));
    const value = raw ? JSON.parse(raw) : null;
    return value && typeof value === 'object' ? value : null;
  } catch (e) {
    console.warn('SuperFaktura credentials not available on this device', e && e.name);
    return null;
  }
}

/**
 * @param {HTMLElement} root
 * @param {{transport?: object, company?: object, onParsed: (parsed: object) => void, createClient?: Function}} options
 */
export function renderSfPanel(root, { transport = null, company = null, onParsed, createClient = createSfClient }) {
  const tr = transport || getTransport();
  const field = (id, label, control, hint = null) => h('div', { class: 'field' }, h('label', { for: id }, label), control, hint ? h('div', { class: 'field-hint' }, hint) : null);
  const market = selectEl(Object.keys(SF_MARKETS).map(m => ({ value: m, label: t(`exim.sf.market.${m}`) })), 'sk', { id: 'exim-sf-market' });
  const email = h('input', { type: 'email', id: 'exim-sf-email', autocomplete: 'username' });
  const key = h('input', { type: 'password', id: 'exim-sf-key', autocomplete: 'off' });
  const companyId = h('input', { type: 'text', id: 'exim-sf-company', inputmode: 'numeric', autocomplete: 'off' });
  const remember = h('input', { type: 'checkbox', id: 'exim-sf-remember' });
  const progress = h('progress', { id: 'exim-sf-progress', max: '1', value: '0', hidden: true, 'aria-label': t('exim.sf.progressLabel') });
  const status = h('p', { class: 'muted small', id: 'exim-sf-status', 'aria-live': 'polite' });
  const start = h('button', { type: 'button', class: 'btn btn-primary', id: 'exim-sf-start' }, t('exim.sf.start'));
  const stop = h('button', { type: 'button', class: 'btn', id: 'exim-sf-stop', hidden: true }, t('exim.sf.stop'));
  const forget = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'exim-sf-forget', hidden: true }, t('exim.sf.forget'));
  let signal = null;

  loadSaved(tr, company && company.id).then(saved => {
    if (!saved) return;
    market.value = SF_MARKETS[saved.market] ? saved.market : 'sk';
    email.value = saved.email || '';
    key.value = saved.apiKey || '';
    companyId.value = saved.companyId || '';
    remember.checked = true;
    forget.hidden = false;
  });

  forget.addEventListener('click', async () => {
    try {
      await tr.secrets.delete(secretName(company && company.id));
    } catch (e) {
      console.warn('SuperFaktura credentials could not be removed', e && e.name);
    }
    key.value = '';
    remember.checked = false;
    forget.hidden = true;
    status.textContent = t('exim.sf.forgotten');
  });

  stop.addEventListener('click', () => { if (signal) signal.aborted = true; });

  start.addEventListener('click', async () => {
    let auth;
    try {
      auth = sfAuthorization({ email: email.value.trim(), apiKey: key.value.trim(), companyId: companyId.value.trim() || null });
    } catch (e) {
      status.textContent = errorText(e, 'errors.SF_CREDENTIALS_MISSING');
      return;
    }
    if (remember.checked) {
      try {
        await tr.secrets.set(secretName(company && company.id), JSON.stringify({ market: market.value, email: email.value.trim(), apiKey: key.value.trim(), companyId: companyId.value.trim() }));
        forget.hidden = false;
      } catch (e) {
        console.warn('SuperFaktura credentials could not be kept on this device', e && e.name);
        status.textContent = t('exim.sf.notKept');
      }
    }
    signal = { aborted: false };
    start.disabled = true;
    stop.hidden = false;
    progress.hidden = false;
    progress.value = 0;
    try {
      const client = createClient({ transport: tr, market: market.value, auth });
      const fetched = await fetchSuperfaktura(client, {
        signal,
        onProgress: ({ stage, done, total }) => {
          progress.max = String(total || 1);
          progress.value = String(done);
          status.textContent = t(`exim.sf.stage.${stage}`, { done, total });
        }
      });
      status.textContent = t('exim.sf.fetched', { clients: fetched.clients.length, items: fetched.items.length, invoices: fetched.invoices.length });
      onParsed(importSuperfakturaApi(fetched, { company }));
    } catch (e) {
      console.error('SuperFaktura download failed', e);
      status.textContent = errorText(e, 'errors.SF_API_ERROR');
    } finally {
      signal = null;
      start.disabled = false;
      stop.hidden = true;
      progress.hidden = true;
    }
  });

  clear(root);
  append(root, [
    h('p', { class: 'muted small' }, t('exim.sf.text')),
    h('div', { class: 'exim-grid' },
      field('exim-sf-market', t('exim.sf.market'), market),
      field('exim-sf-email', t('exim.sf.email'), email),
      field('exim-sf-key', t('exim.sf.key'), key, t('exim.sf.keyHint')),
      field('exim-sf-company', t('exim.sf.companyId'), companyId, t('exim.sf.companyIdHint'))),
    h('label', { for: 'exim-sf-remember', class: 'checkbox-label' }, remember, h('span', {}, t('exim.sf.remember'))),
    h('div', { class: 'exim-actions' }, start, stop, forget),
    progress, status
  ]);
}
