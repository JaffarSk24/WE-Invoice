// Settings > eFaktúra (04-peppol.md § 4.9): the connection wizard on one
// page, step by step: what e-invoicing is, the beta, the provider from
// providers.json, the choice in VPDS, the keys with a connection test, the
// Peppol registration check and the options. Changing the provider is the
// same wizard with a new key; the archive stays in the user's Drive.
import { h, icon } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { currentCompany } from '../shell/company-state.js';
import { isDemo } from '../shell/demo-mode.js';
import { stepCard } from './peppol-section-save.js';
import { peppolSettings } from '../../peppol/connection.js';
import { findProvider, providerList } from '../../peppol/providers.js';
import { providerStep } from './peppol-section-provider.js';
import { connectStep, lookupStep } from './peppol-section-connect.js';
import { betaStep, optionsStep } from './peppol-section-options.js';

function introStep() {
  return stepCard('intro', t('peppol.intro.title'),
    h('ul', { class: 'peppol-intro' },
      h('li', {}, t('peppol.intro.send')),
      h('li', {}, t('peppol.intro.receive')),
      h('li', {}, t('peppol.intro.deadline')),
      h('li', {}, t('peppol.intro.byo'))),
    h('a', { href: '#/help', class: 'btn btn-ghost btn-sm' }, icon('circle-help'), t('peppol.intro.help')));
}

/**
 * The section renderer for registerSettingsSection('peppol', ...).
 * @param {{transport: object}} deps
 */
export function createPeppolSection({ transport }) {
  return function peppolSection(root, { redraw }) {
    const company = currentCompany();
    const demo = isDemo();
    const settings = peppolSettings(company);
    const firstConnectable = providerList().find(p => p.flags?.primaryTest) || providerList()[0];
    const state = {
      providerId: settings.providerId || firstConnectable.id,
      baseUrl: settings.baseUrl || '',
      sandbox: settings.sandbox
    };
    const ctx = { transport, company, settings, state, demo, redraw, provider: () => findProvider(state.providerId) };
    root.append(h('p', { class: 'muted' }, t('settings.section.peppol.text'), ' ', h('span', { class: 'badge peppol-beta' }, t('peppol.beta.badge'))));
    if (demo) root.append(h('p', { class: 'callout' }, t('peppol.demo.readOnly')));
    const connectBox = h('div', {});
    const drawConnect = () => {
      connectBox.replaceChildren(connectStep(ctx), lookupStep(ctx));
      refreshIcons(connectBox);
    };
    ctx.onProviderChange = drawConnect;
    root.append(introStep(), betaStep(ctx));
    if (!company) return;
    if (!company.dic) {
      root.append(h('p', { class: 'callout callout-warning' }, t('peppol.connect.noDic')));
      return;
    }
    root.append(providerStep(ctx), connectBox, optionsStep(ctx));
    drawConnect();
    refreshIcons(root);
  };
}
