// The Reminders section of Settings (03-features.md § 3.10): the company
// policy, kept as one record of the collection reminderPolicies. A
// reminder before the due date and up to three levels after it (empty =
// off), the minimum amount, no reminders at the weekend, late interest
// with the ECB base rate the user enters (the margins come from
// legislation and are shown, never typed in), the flat recovery cost for
// companies, thank-you notes and automatic sending.
import '../../style/contacts.css';
import '../../style/recurring.css';
import { h } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { showToast } from '../../ui/toast.js';
import { getLegislation, add, round } from '@we-invoice/core';
import { checkboxField, numberField } from '../../components/fields.js';
import { todayLocal } from '../../components/dates.js';
import { formatAmount } from '../../components/decimal.js';
import { listOf, write } from '../contacts/source.js';
import { effectivePolicy } from '../reminders/plan.js';

const ECB_RATES_URL = 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/key_ecb_interest_rates/html/index.en.html';
const intOrNull = (v) => (v === null || v === '' || v === undefined ? null : Number(v));

function legalHints(ecbRatePct) {
  try {
    const today = todayLocal();
    const rule = getLegislation('latePaymentInterest', today);
    const flat = getLegislation('recoveryCostFlat.amount', today);
    const rate = ecbRatePct ? { b2b: round(add(ecbRatePct, rule.b2bMarginPp)), b2c: round(add(ecbRatePct, rule.b2cMarginPp)) } : null;
    return { rule, flat, rate };
  } catch (e) {
    console.warn('Late interest rules unavailable', e);
    return null;
  }
}

// Checks the form values; returns { policy, errors }.
export function readPolicy(values, base) {
  const errors = {};
  const levels = values.levels.map(v => intOrNull(v));
  levels.forEach((v, i) => { if (v !== null && (!Number.isInteger(v) || v < 1 || v > 365)) errors[`level${i}`] = 'DUE_DAYS_INVALID'; });
  const before = intOrNull(values.beforeDueDays);
  if (before !== null && (!Number.isInteger(before) || before < 0 || before > 60)) errors.beforeDueDays = 'DUE_DAYS_INVALID';
  if (values.minAmount && !/^\d+(\.\d+)?$/.test(values.minAmount)) errors.minAmount = 'PRICE_INVALID';
  if (values.ecbRatePct && !/^-?\d+(\.\d+)?$/.test(values.ecbRatePct)) errors.ecbRatePct = 'PRICE_INVALID';
  const kept = levels.filter(v => v !== null).sort((a, b) => a - b).map(afterDays => ({ afterDays, templateId: null }));
  return {
    errors,
    policy: { ...base, ...values, levels: kept, beforeDueDays: before, minAmount: values.minAmount || null, ecbRatePct: values.ecbRatePct || null }
  };
}

export function remindersSection(root) {
  const records = listOf('reminderPolicies');
  const record = records[0] || null;
  const p = effectivePolicy(records);
  const hints = legalHints(p.ecbRatePct);
  const f = {
    enabled: checkboxField({ label: t('settings.reminders.enabled'), checked: p.enabled }),
    beforeDueDays: numberField({ label: t('settings.reminders.beforeDue'), value: p.beforeDueDays === null ? null : String(p.beforeDueDays), hint: t('settings.reminders.emptyOff') }),
    level0: numberField({ label: t('settings.reminders.level', { n: 1 }), value: p.levels[0] ? String(p.levels[0].afterDays) : null, hint: t('settings.reminders.afterDue') }),
    level1: numberField({ label: t('settings.reminders.level', { n: 2 }), value: p.levels[1] ? String(p.levels[1].afterDays) : null, hint: t('settings.reminders.afterDue') }),
    level2: numberField({ label: t('settings.reminders.level', { n: 3 }), value: p.levels[2] ? String(p.levels[2].afterDays) : null, hint: t('settings.reminders.afterDue') }),
    minAmount: numberField({ label: t('settings.reminders.minAmount'), value: p.minAmount }),
    skipWeekends: checkboxField({ label: t('settings.reminders.skipWeekends'), checked: p.skipWeekends }),
    includeProformas: checkboxField({ label: t('settings.reminders.includeProformas'), checked: p.includeProformas }),
    lateInterest: checkboxField({ label: t('settings.reminders.lateInterest'), checked: p.lateInterest, hint: hints ? t('settings.reminders.lateInterestHint', { b2b: hints.rule.b2bMarginPp, b2c: hints.rule.b2cMarginPp }) : null }),
    ecbRatePct: numberField({ label: t('settings.reminders.ecbRate'), value: p.ecbRatePct, hint: hints && hints.rate ? t('settings.reminders.ratesNow', hints.rate) : t('settings.reminders.ecbRateHint'), attrs: { id: 'reminders-ecb-rate' } }),
    recoveryCostFlat: checkboxField({ label: t('settings.reminders.recoveryCost', { amount: hints ? formatAmount(hints.flat, 'EUR') : '' }), checked: p.recoveryCostFlat, hint: t('settings.reminders.recoveryCostHint') }),
    thankYou: checkboxField({ label: t('settings.reminders.thankYou'), checked: p.thankYou }),
    autoSend: checkboxField({ label: t('settings.reminders.autoSend'), checked: p.autoSend, hint: t('settings.reminders.autoSendHint') })
  };
  const save = async () => {
    const { policy, errors } = readPolicy({
      enabled: f.enabled.value(), beforeDueDays: f.beforeDueDays.value(), levels: [f.level0.value(), f.level1.value(), f.level2.value()],
      minAmount: f.minAmount.value(), skipWeekends: f.skipWeekends.value(), includeProformas: f.includeProformas.value(), lateInterest: f.lateInterest.value(),
      ecbRatePct: f.ecbRatePct.value(), recoveryCostFlat: f.recoveryCostFlat.value(), thankYou: f.thankYou.value(), autoSend: f.autoSend.value()
    }, record || {});
    Object.entries(f).forEach(([k, field]) => field.setError(errors[k] ? t(`crm.error.${errors[k]}`) : null));
    if (Object.keys(errors).length) return;
    const fields = { ...policy };
    ['id', 'createdAt', 'updatedAt', 'deleted'].forEach(k => delete fields[k]);
    const saved = await write(store => (record ? store.update('reminderPolicies', record.id, fields) : store.insert('reminderPolicies', fields)));
    if (saved) showToast(t('settings.reminders.saved'), { type: 'success' });
  };
  root.append(
    h('p', { class: 'muted' }, t('settings.reminders.intro')),
    h('form', { class: 'reminder-policy', novalidate: true, onsubmit: (e) => { e.preventDefault(); save(); } },
      f.enabled.el,
      h('div', { class: 'form-grid' }, f.beforeDueDays.el, f.minAmount.el, f.level0.el, f.level1.el, f.level2.el),
      h('p', { class: 'muted small' }, t('settings.reminders.texts'), ' ', h('a', { href: '#/settings/email' }, t('settings.section.email'))),
      f.skipWeekends.el, f.includeProformas.el,
      h('h3', { class: 'settings-subtitle' }, t('settings.reminders.interestTitle')),
      f.lateInterest.el,
      h('div', { class: 'form-grid' }, f.ecbRatePct.el),
      h('p', { class: 'muted small' }, h('a', { href: ECB_RATES_URL, target: '_blank', rel: 'noopener' }, t('settings.reminders.ecbLink'))),
      f.recoveryCostFlat.el,
      h('h3', { class: 'settings-subtitle' }, t('settings.reminders.sendingTitle')),
      f.thankYou.el, f.autoSend.el,
      h('div', { class: 'form-actions' }, h('button', { type: 'submit', class: 'btn btn-primary', id: 'reminders-save' }, t('common.save')))));
}
