// Company steps: IČO with lookup in the registers (manual entry when the
// lookup fails), VAT mode and bookkeeping mode.
import { h, icon } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { textField, selectField, radioGroup, checkboxField } from '../../components/fields.js';
import { lookupCompany } from './lookup.js';
import { checkIco } from './validators.js';
import { accountingModesFor, taxpayerTypeFor, normalizeIco } from './state.js';

const LEGAL_FORMS = ['FO_ZIVNOST', 'SRO', 'AS', 'NGO', 'OTHER'];

export function companyStep({ draft, update, transport }) {
  const ico = textField({ label: t('onboarding.company.ico'), value: draft.ico, hint: t('onboarding.company.icoHint'), attrs: { inputmode: 'numeric', id: 'ob-ico' } });
  const name = textField({ label: t('onboarding.company.name'), value: draft.name, required: true, attrs: { id: 'ob-name' } });
  const legalForm = selectField({ label: t('onboarding.company.legalForm'), options: LEGAL_FORMS.map(v => ({ value: v, label: t(`legalForm.${v}`) })), value: draft.legalForm, attrs: { id: 'ob-legal-form' } });
  const dic = textField({ label: t('onboarding.company.dic'), value: draft.dic, attrs: { inputmode: 'numeric' } });
  const icDph = textField({ label: t('onboarding.company.icDph'), value: draft.icDph });
  const street = textField({ label: t('onboarding.company.street'), value: draft.address.street });
  const city = textField({ label: t('onboarding.company.city'), value: draft.address.city });
  const zip = textField({ label: t('onboarding.company.zip'), value: draft.address.zip });
  const registerEntry = textField({ label: t('onboarding.company.registerEntry'), value: draft.registerEntry });
  const status = h('p', { class: 'wizard-note', role: 'status', id: 'ob-lookup-status' });

  const fill = (found) => {
    name.input.value = found.name; legalForm.input.value = found.legalForm; dic.input.value = found.dic; icDph.input.value = found.icDph;
    street.input.value = found.address.street; city.input.value = found.address.city; zip.input.value = found.address.zip;
    registerEntry.input.value = found.registerEntry;
    update({ ...found, ico: normalizeIco(ico.input.value) });
  };
  const lookup = h('button', {
    type: 'button', class: 'btn', id: 'ob-lookup', onclick: async () => {
      const value = normalizeIco(ico.input.value);
      ico.input.value = value;
      const valid = checkIco(value);
      if (valid === false) { ico.setError(t('onboarding.error.icoFormat')); return; }
      ico.setError(null);
      lookup.disabled = true;
      status.textContent = t('onboarding.company.looking');
      try {
        fill(await lookupCompany(transport, value));
        status.textContent = valid === null ? t('onboarding.company.foundUnverified') : t('onboarding.company.found');
      } catch (e) {
        console.error('Company lookup failed', e);
        const key = `errors.${e && e.code}`;
        status.textContent = `${t(key) === key ? t('errors.UNKNOWN') : t(key)} ${t('onboarding.company.manual')}`;
      } finally {
        lookup.disabled = false;
      }
    }
  }, icon('search'), t('onboarding.company.lookup'));
  ico.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); lookup.click(); } });

  const el = h('div', { class: 'wizard-step' },
    h('p', { class: 'muted' }, t('onboarding.company.text')),
    h('div', { class: 'wizard-lookup' }, ico.el, lookup), status,
    h('div', { class: 'form-grid' }, name.el, legalForm.el, dic.el, icDph.el, street.el, city.el, zip.el, registerEntry.el));
  refreshIcons(el);
  return {
    el,
    beforeNext: () => {
      const patch = {
        ico: normalizeIco(ico.value()), name: name.value(), legalForm: legalForm.value(), taxpayerType: taxpayerTypeFor(legalForm.value()),
        dic: dic.value(), icDph: icDph.value(), registerEntry: registerEntry.value(),
        address: { ...draft.address, street: street.value(), city: city.value(), zip: zip.value() }
      };
      if (!accountingModesFor(patch.legalForm).includes(draft.accountingMode)) patch.accountingMode = 'NONE';
      update(patch);
      if (!patch.name) { name.setError(t('onboarding.error.nameRequired')); return false; }
      if (patch.ico && checkIco(patch.ico) === false) { ico.setError(t('onboarding.error.icoFormat')); return false; }
      return true;
    }
  };
}

export function vatStep({ draft, update }) {
  const mode = radioGroup({
    label: t('onboarding.vat.title'), name: 'vatMode', value: draft.vatMode,
    options: ['PAYER', 'REGISTERED_7', 'NONPAYER'].map(v => ({ value: v, label: t(`vatMode.${v}`), hint: t(`vatMode.${v}.hint`) })),
    onChange: (v) => { update({ vatMode: v }); details.hidden = v !== 'PAYER'; }
  });
  const period = selectField({ label: t('onboarding.vat.period'), options: ['MONTH', 'QUARTER'].map(v => ({ value: v, label: t(`vatPeriod.${v}`) })), value: draft.vatPeriod, onChange: (v) => update({ vatPeriod: v }) });
  const cash = checkboxField({ label: t('onboarding.vat.cashBasis'), checked: draft.cashBasis, hint: t('onboarding.vat.cashBasisHint'), onChange: (v) => update({ cashBasis: v }) });
  const oss = checkboxField({ label: t('onboarding.vat.oss'), checked: draft.oss, hint: t('onboarding.vat.ossHint'), onChange: (v) => update({ oss: v }) });
  const details = h('div', { class: 'wizard-sub', hidden: draft.vatMode !== 'PAYER' }, period.el, cash.el, oss.el);
  return { el: h('div', { class: 'wizard-step' }, h('p', { class: 'muted' }, t('onboarding.vat.text')), mode.el, details) };
}

export function accountingStep({ draft, update }) {
  const modes = accountingModesFor(draft.legalForm);
  const group = radioGroup({
    label: t('onboarding.accounting.title'), name: 'accountingMode', value: modes.includes(draft.accountingMode) ? draft.accountingMode : 'NONE',
    options: modes.map(v => ({ value: v, label: t(`accountingMode.${v}`), hint: t(`accountingMode.${v}.hint`) })),
    onChange: (v) => update({ accountingMode: v })
  });
  const note = modes.length === 2 ? h('p', { class: 'wizard-note' }, t('onboarding.accounting.sroNote')) : null;
  return { el: h('div', { class: 'wizard-step' }, h('p', { class: 'muted' }, t('onboarding.accounting.text')), group.el, note) };
}
