// Bank accounts and images of the company in Settings: the accounts with
// IBAN check and default per currency, and the logo, signature and stamp
// (PNG with transparency, or JPEG) kept as data URLs on the company record
// for the PDF, like the logo the wizard stores.
import { uuidv7 } from '@we-invoice/core';
import { h, icon } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { openModal, confirmDialog } from '../../ui/modal.js';
import { showToast, showError } from '../../ui/toast.js';
import { textField, checkboxField } from '../../components/fields.js';
import { bankAccountFrom, withAccount, imageError } from './company-section-rules.js';
import { saveCompanyPatch } from './company-section-store.js';

function openAccountDialog({ company, account, onSaved }) {
  const a = account || { id: uuidv7(), name: '', iban: '', bic: '', currency: 'EUR', isDefault: !(company.bankAccounts || []).length };
  const name = textField({ label: t('documents.company.accountName'), value: a.name || '' });
  const iban = textField({ label: t('documents.company.iban'), value: a.iban || '', required: true, attrs: { id: 'account-iban' } });
  const bic = textField({ label: t('documents.company.bic'), value: a.bic || '', hint: t('documents.company.bicHint') });
  const currency = textField({ label: t('documents.editor.currency'), value: a.currency || 'EUR', attrs: { maxlength: '3' } });
  const isDefault = checkboxField({ label: t('documents.company.accountDefault'), checked: Boolean(a.isDefault) });
  openModal({
    title: account ? t('documents.company.editAccount') : t('documents.company.addAccount'),
    body: h('div', { class: 'form-grid' }, name.el, iban.el, bic.el, currency.el, isDefault.el),
    actions: [
      { label: t('common.cancel'), onClick: (m) => m.close() },
      {
        label: t('common.save'), kind: 'primary', onClick: async (m) => {
          const result = bankAccountFrom({ id: a.id, name: name.value(), iban: iban.value(), bic: bic.value(), currency: currency.value(), isDefault: isDefault.value() });
          iban.setError(result.error === 'documents.company.errors.iban' ? t(result.error) : null);
          bic.setError(result.error === 'documents.company.errors.bic' ? t(result.error) : null);
          currency.setError(result.error === 'documents.company.errors.currency' ? t(result.error) : null);
          if (result.error) return;
          try {
            if (await saveCompanyPatch({ bankAccounts: withAccount(company.bankAccounts, result.account) })) { m.close(); onSaved(); }
          } catch (e) { showError(e); }
        }
      }
    ]
  });
}

export function accountsBlock(company, { demo, redraw }) {
  const accounts = company.bankAccounts || [];
  const rows = accounts.map(a => h('div', { class: 'setting-row', dataset: { accountId: a.id } },
    h('div', { class: 'setting-text' }, h('span', { class: 'setting-label num' }, a.iban), h('span', { class: 'setting-hint' }, [a.name, a.bic, a.currency, a.isDefault ? t('documents.company.accountDefault') : null].filter(Boolean).join(' · '))),
    h('div', { class: 'setting-control' },
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', disabled: demo, onclick: () => openAccountDialog({ company, account: a, onSaved: redraw }) }, icon('pencil-line'), t('documents.series.edit')),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', disabled: demo, onclick: async () => {
        if (!(await confirmDialog(t('documents.company.removeAccountConfirm'), { danger: true }))) return;
        try { if (await saveCompanyPatch({ bankAccounts: accounts.filter(x => x.id !== a.id) })) redraw(); } catch (e) { showError(e); }
      } }, icon('trash-2'), t('common.delete')))));
  return h('div', { class: 'company-accounts' },
    h('h3', { class: 'settings-subtitle' }, t('documents.company.accounts')),
    rows.length ? rows : h('p', { class: 'muted small' }, t('documents.company.noAccounts')),
    h('button', { type: 'button', class: 'btn', id: 'company-add-account', disabled: demo, onclick: () => openAccountDialog({ company, account: null, onSaved: redraw }) }, icon('plus'), t('documents.company.addAccount')));
}

const IMAGES = [['logoDataUrl', 'pdf.settings.logo'], ['signatureDataUrl', 'pdf.settings.signature'], ['stampDataUrl', 'pdf.settings.stamp']];

function imageRow(company, key, label, { demo, redraw }) {
  const input = h('input', { type: 'file', accept: 'image/png,image/jpeg', class: 'visually-hidden', id: `company-${key}` });
  const preview = company[key] ? h('img', { class: 'logo-preview', src: company[key], alt: t(label) }) : h('span', { class: 'muted small' }, t('documents.company.noImage'));
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    const error = imageError(file);
    if (error) { showToast(t(error), { type: 'error' }); return; }
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => { try { if (await saveCompanyPatch({ [key]: reader.result })) redraw(); } catch (e) { showError(e); } };
    reader.onerror = () => { console.error('Image could not be read', reader.error); showToast(t('documents.company.errors.imageRead'), { type: 'error' }); };
    reader.readAsDataURL(file);
  });
  return h('div', { class: 'setting-row' },
    h('div', { class: 'setting-text' }, h('span', { class: 'setting-label' }, t(label)), preview),
    h('div', { class: 'setting-control' },
      h('label', { for: `company-${key}`, class: `btn btn-ghost btn-sm ${demo ? 'is-disabled' : ''}`.trim() }, icon('import'), t('documents.company.chooseImage')), demo ? null : input,
      company[key] ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm', disabled: demo, onclick: async () => { try { if (await saveCompanyPatch({ [key]: null })) redraw(); } catch (e) { showError(e); } } }, icon('x'), t('documents.company.removeImage')) : null));
}

export function imagesBlock(company, opts) {
  return h('div', { class: 'company-images' }, h('h3', { class: 'settings-subtitle' }, t('documents.company.images')), IMAGES.map(([key, label]) => imageRow(company, key, label, opts)));
}
