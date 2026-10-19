// Step 1 and 2 of the eFaktúra wizard: the provider cards from
// providers.json (tariff, "free receiving", "API on the free plan", sign-up
// and price links; a list, never a free URL, except for "another SAPI-SK
// provider") and the instructions for choosing the provider in VPDS.
import { h, icon } from '../../ui/dom.js';
import { t, currentLang } from '../../i18n/index.js';
import { showError } from '../../ui/toast.js';
import { providerList, isConnectable, tariffText, isValidCustomBase } from '../../peppol/providers.js';
import { savePeppolSettings, stepCard } from './peppol-section-save.js';

const VPDS_URL = 'https://vpds.financnasprava.sk/';

function link(href, label) {
  return href ? h('a', { href, target: '_blank', rel: 'noopener noreferrer', class: 'peppol-link' }, label, ' ', icon('external-link')) : null;
}

function providerCard(provider, ctx, onPick) {
  const connectable = isConnectable(provider);
  const checked = ctx.state.providerId === provider.id;
  const flags = provider.flags || {};
  return h('label', { class: `radio-card peppol-provider ${connectable ? '' : 'is-disabled'}`.trim(), dataset: { provider: provider.id } },
    h('input', { type: 'radio', name: 'peppol-provider', value: provider.id, checked, disabled: !connectable || ctx.demo, onchange: () => onPick(provider.id) }),
    h('span', { class: 'radio-text' },
      h('span', { class: 'radio-title' }, provider.name, provider.efsk ? h('span', { class: 'muted small' }, ` ${t('peppol.provider.efsk', { code: provider.efsk })}`) : null),
      h('span', { class: 'peppol-flags' },
        flags.freeReceive ? h('span', { class: 'badge' }, t('peppol.provider.freeReceive')) : null,
        flags.apiOnFree ? h('span', { class: 'badge' }, t('peppol.provider.apiOnFree')) : null,
        flags.primaryTest ? h('span', { class: 'badge' }, t('peppol.provider.recommended')) : null),
      h('span', { class: 'radio-hint' }, tariffText(provider, currentLang())),
      connectable ? null : h('span', { class: 'radio-hint' }, t('peppol.provider.notConnectable')),
      h('span', { class: 'peppol-links' }, link(provider.registerUrl, t('peppol.provider.register')), link(provider.pricingUrl, t('peppol.provider.pricing')))));
}

export function providerStep(ctx) {
  const list = providerList();
  const groups = { SMALL: list.filter(p => p.segment === 'SMALL'), OTHER: list.filter(p => p.segment !== 'SMALL') };
  const custom = h('div', { class: 'field peppol-custom-base', hidden: ctx.state.providerId !== 'sapi-sk' },
    h('label', { for: 'peppol-custom-base' }, t('peppol.provider.customBase')),
    h('input', { id: 'peppol-custom-base', type: 'url', value: ctx.state.baseUrl, placeholder: 'https://', disabled: ctx.demo, autocomplete: 'off' }),
    h('div', { class: 'field-hint' }, t('peppol.provider.customBaseHint')),
    h('div', { class: 'field-error', role: 'alert', hidden: true }));
  const input = custom.querySelector('input');
  const error = custom.querySelector('.field-error');
  input.addEventListener('change', () => {
    const ok = !input.value || isValidCustomBase(input.value);
    error.textContent = ok ? '' : t('peppol.provider.customBaseInvalid');
    error.hidden = ok;
    if (ok) ctx.state.baseUrl = input.value.trim();
  });
  const pick = (id) => {
    ctx.state.providerId = id;
    custom.hidden = id !== 'sapi-sk';
    ctx.onProviderChange();
  };
  const cards = h('div', { class: 'radio-group peppol-providers', role: 'radiogroup', 'aria-labelledby': 'peppol-step-provider' },
    groups.SMALL.map(p => providerCard(p, ctx, pick)));
  const more = h('details', { class: 'peppol-more' }, h('summary', {}, t('peppol.provider.more')),
    h('div', { class: 'radio-group' }, groups.OTHER.map(p => providerCard(p, ctx, pick))));
  return h('div', {}, stepCard('provider', t('peppol.provider.title'), cards, custom, more), vpdsStep(ctx));
}

function vpdsStep(ctx) {
  const done = h('input', { type: 'checkbox', id: 'peppol-vpds-done', checked: ctx.settings.vpdsDone, disabled: ctx.demo });
  done.addEventListener('change', () => savePeppolSettings({ vpdsDone: done.checked }).catch(e => { done.checked = !done.checked; showError(e); }));
  return stepCard('vpds', t('peppol.vpds.title'),
    h('ol', {}, h('li', {}, t('peppol.vpds.step1')), h('li', {}, t('peppol.vpds.step2')), h('li', {}, t('peppol.vpds.step3'))),
    link(VPDS_URL, t('peppol.vpds.open')),
    h('label', { class: 'checkbox-label', for: 'peppol-vpds-done' }, done, ' ', t('peppol.vpds.done')));
}
