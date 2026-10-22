// Previews of the three reports and their definitions for report-view.js:
// the kontrolný výkaz by section, the súhrnný výkaz by buyer with the VIES
// check, and the VAT return by row of the form.
import { h, icon } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { buildKv, buildSv, buildVatReturn, FILING_TYPES, getLegislation, parseTaxPeriod } from '@we-invoice/core';
import { showToast, showError } from '../../ui/toast.js';
import { simpleTable, money, documentLink } from './parts.js';
import { checkVies } from './actions.js';

const KV_SECTIONS = ['A1', 'A2', 'B1', 'B2', 'B3', 'C1', 'C2', 'D1', 'D2'];

function kvColumns(section) {
  const rate = { label: t('tax.records.rate'), value: r => (r.rate ? `${r.rate} %` : ''), num: true };
  const base = { label: t('tax.records.base'), value: r => money(r.base), num: true };
  const vat = { label: t('tax.records.vat'), value: r => money(r.vat), num: true };
  const deducted = { label: t('tax.records.deductible'), value: r => money(r.deductible), num: true };
  const party = (key, label) => ({ label: t(label), value: r => r[key] || '', nowrap: true });
  const number = { label: t('tax.records.number'), value: r => documentLink(r.kind, r.docId, r.number), nowrap: true };
  const date = { label: t('tax.records.date'), value: r => r.date || '', nowrap: true };
  switch (section) {
    case 'A1': return [party('buyer', 'tax.records.buyerVatId'), number, date, base, vat, rate];
    case 'A2': return [party('buyer', 'tax.records.buyerVatId'), number, date, base];
    case 'B1': case 'B2': return [party('supplier', 'tax.records.supplierVatId'), number, date, base, vat, rate, deducted];
    case 'C1': case 'C2': return [party(section === 'C1' ? 'buyer' : 'supplier', section === 'C1' ? 'tax.records.buyerVatId' : 'tax.records.supplierVatId'), number,
      { label: t('tax.kv.original'), value: r => r.original || '' }, base, vat, rate, ...(section === 'C2' ? [deducted] : [])];
    default: return [rate, base, vat];
  }
}

function kvSection(kv, section) {
  let rows = kv.sections[section];
  if (section === 'B3') {
    const b3 = kv.sections.B3;
    rows = b3.perSupplier ? b3.suppliers : b3.total ? [b3.total] : [];
    const cols = [...(b3.perSupplier ? [{ label: t('tax.records.supplierVatId'), value: r => r.supplier }] : []),
      { label: t('tax.records.base'), value: r => money(r.base), num: true }, { label: t('tax.records.vat'), value: r => money(r.vat), num: true },
      { label: t('tax.records.deductible'), value: r => money(r.deductible), num: true }];
    return sectionBlock(section, rows.length ? simpleTable(cols, rows) : null, b3.perSupplier ? 'tax.kv.B32' : 'tax.kv.B31');
  }
  return sectionBlock(section, rows.length ? simpleTable(kvColumns(section), rows) : null);
}

function sectionBlock(section, table, titleKey = null) {
  return h('section', { class: 'tax-section' },
    h('h3', {}, t(titleKey || `tax.kv.${section}`)),
    table || h('p', { class: 'muted' }, t('tax.preview.empty')));
}

export const KV_REPORT = {
  report: 'kv',
  title: 'screen.kv.title',
  types: FILING_TYPES,
  build: buildKv,
  preview: (kv) => h('div', { class: 'tax-sections' }, KV_SECTIONS.map(s => kvSection(kv, s)))
};

export const SV_REPORT = {
  report: 'sv',
  title: 'screen.sv.title',
  types: FILING_TYPES,
  periodKinds: true,
  build: buildSv,
  prepare: async (records, { state }) => ({ vies: state.vies || {} }),
  preview: (sv, { ctx, state, redraw }) => {
    const ids = sv.rows.map(r => r.vatId);
    const verify = async () => {
      if (!ids.length) return;
      try {
        state.vies = { ...(state.vies || {}), ...(await checkVies(ctx.transport, ids)) };
        showToast(t('tax.sv.viesDone'), { type: 'info' });
        redraw();
      } catch (e) {
        console.error('VIES check failed', e);
        showError(e);
      }
    };
    const vies = state.vies || {};
    return h('div', {},
      h('div', { class: 'tax-buttons' }, h('button', { type: 'button', class: 'btn', disabled: !ids.length, onclick: verify }, icon('shield-check'), t('tax.sv.vies'))),
      sv.rows.length ? simpleTable([
        { label: t('tax.sv.country'), value: r => r.country },
        { label: t('tax.records.vatId'), value: r => r.number },
        { label: t('tax.sv.code'), value: r => t(`tax.sv.code.${r.code}`) },
        { label: t('tax.sv.value'), value: r => money(r.value), num: true },
        { label: t('tax.sv.viesStatus'), value: r => t(`tax.sv.viesState.${vies[r.vatId] || 'NONE'}`) }
      ], sv.rows) : h('p', { class: 'muted' }, t('tax.preview.empty')));
  }
};

const RATE_CODE = /\.(STANDARD|REDUCED_1|REDUCED_2)(?=\.|$)/;

// "supply.STANDARD.base" -> the text of supply_base with the rate of the period.
function rowMeaning(key, period) {
  const code = (RATE_CODE.exec(key) || [])[1];
  const rate = code ? getLegislation(`vatRates.${code}.rate`, parseTaxPeriod(period).from) : '';
  return t(`tax.vatReturn.key.${key.replace(RATE_CODE, '').replace(/\./g, '_')}`, { rate });
}

export const VAT_RETURN_REPORT = {
  report: 'vatReturn',
  title: 'screen.vatReturn.title',
  types: FILING_TYPES,
  build: buildVatReturn,
  preview: (vr) => h('div', {},
    h('p', { class: 'muted' }, t('tax.vatReturn.notComputed')),
    vr.rows.length ? simpleTable([
      { label: t('tax.vatReturn.row'), value: r => r.row.replace(/^r/, '') },
      { label: t('tax.vatReturn.meaning'), value: r => rowMeaning(r.key, vr.period) },
      { label: t('tax.vatReturn.amount'), value: r => money(r.amount), num: true }
    ], vr.rows) : h('p', { class: 'muted' }, t('tax.preview.empty')))
};
