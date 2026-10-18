// The "My company" wizard as a pure state machine: the steps, which of
// them apply to a draft, what each needs before the next one, and the
// draft kept on the device so the wizard can be interrupted and resumed.
export const STEPS = Object.freeze(['language', 'signin', 'encryption', 'company', 'vat', 'accounting', 'bank', 'logo', 'peppol', 'done']);

export const DRAFT_KEY = 'we-invoice-onboarding';
export const LOCAL_COMPANY_KEY = 'we-invoice-local-company';

export const EMPTY_DRAFT = Object.freeze({
  step: 'language', language: null, signIn: null, encryption: null,
  name: '', legalForm: 'FO_ZIVNOST', taxpayerType: 'FO', ico: '', dic: '', icDph: '', registerEntry: '',
  address: { street: '', city: '', zip: '', country: 'SK' },
  vatMode: 'NONPAYER', vatPeriod: 'MONTH', cashBasis: false, oss: false,
  accountingMode: 'NONE', iban: '', bic: '', logoDataUrl: null, peppol: 'later'
});

// Companies (s. r. o., a. s.) keep double-entry books by law, so the
// wizard offers them only "invoicing only" and "an accountant does it".
export function accountingModesFor(legalForm) {
  return legalForm === 'SRO' || legalForm === 'AS' ? ['NONE', 'EXTERNAL'] : ['NONE', 'TAX_RECORDS_FLAT', 'SIMPLE', 'EXTERNAL'];
}

export function taxpayerTypeFor(legalForm) {
  return legalForm === 'FO_ZIVNOST' ? 'FO' : 'PO';
}

// Demo mode needs no sign-in, encryption or company details.
export function stepApplies(step, draft) {
  if (draft.signIn === 'demo') return step === 'language' || step === 'signin' || step === 'done';
  if (step === 'encryption' && draft.signIn === 'local') return false;
  return true;
}

export function nextStep(step, draft) {
  const i = STEPS.indexOf(step);
  for (let j = i + 1; j < STEPS.length; j++) if (stepApplies(STEPS[j], draft)) return STEPS[j];
  return null;
}

export function prevStep(step, draft) {
  const i = STEPS.indexOf(step);
  for (let j = i - 1; j >= 0; j--) if (stepApplies(STEPS[j], draft)) return STEPS[j];
  return null;
}

// Error keys (i18n) that stop the wizard at a step; [] when it may go on.
export function stepErrors(step, draft) {
  const errors = [];
  if (step === 'signin' && !draft.signIn) errors.push('onboarding.error.chooseSignIn');
  if (step === 'company') {
    if (!String(draft.name || '').trim()) errors.push('onboarding.error.nameRequired');
    if (draft.ico && !/^\d{6,8}$/.test(draft.ico)) errors.push('onboarding.error.icoFormat');
  }
  if (step === 'accounting' && !accountingModesFor(draft.legalForm).includes(draft.accountingMode)) errors.push('onboarding.error.accountingMode');
  if (step === 'bank' && draft.iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(draft.iban)) errors.push('onboarding.error.ibanFormat');
  return errors;
}

export function progress(step, draft) {
  const applicable = STEPS.filter(s => stepApplies(s, draft));
  return { index: applicable.indexOf(step) + 1, total: applicable.length };
}

export function normalizeIban(text) {
  return String(text || '').replace(/\s+/g, '').toUpperCase();
}

export function normalizeIco(text) {
  return String(text || '').replace(/\s+/g, '');
}

// The company record the wizard hands over (schema Company, WP-0).
export function draftToCompany(draft, { id, now }) {
  return {
    id, createdAt: now, updatedAt: now, deleted: false,
    name: draft.name.trim(), legalForm: draft.legalForm, taxpayerType: taxpayerTypeFor(draft.legalForm),
    ico: draft.ico || null, dic: draft.dic || null, icDph: draft.icDph || null,
    vatMode: draft.vatMode, vatPeriod: draft.vatPeriod, cashBasis: Boolean(draft.cashBasis), oss: Boolean(draft.oss), usesEkasa: false,
    registerEntry: draft.registerEntry || null,
    address: { ...draft.address },
    bankAccounts: draft.iban ? [{ id: `${id}-bank-1`, name: '', iban: draft.iban, bic: draft.bic || null, currency: 'EUR', isDefault: true }] : [],
    email: null, phone: null, web: null, logoFileId: null, signatureFileId: null, stampFileId: null,
    accountingMode: draft.accountingMode, businessStartDate: null,
    peppol: { providerId: null, baseUrl: null, participantId: null, enabled: false, sandbox: false, lastCheckAt: null, capabilities: {} },
    secrets: {},
    defaults: {
      dueDays: 14, currency: 'EUR', language: 'sk', secondLanguage: null, template: 'CLASSIC', brandColor: null,
      texts: { intro: null, outro: null, footer: null }, paymentMethod: 'TRANSFER', roundingCash: false,
      pdfFileMask: '{number}', showMadeWith: true, attachPdfToEInvoice: true
    },
    series: [], closedPeriods: [], note: '', onboardedAt: now,
    logoDataUrl: draft.logoDataUrl || null
  };
}

function storage() {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

export function loadDraft() {
  try {
    const raw = storage() && storage().getItem(DRAFT_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? { ...EMPTY_DRAFT, ...parsed, address: { ...EMPTY_DRAFT.address, ...(parsed.address || {}) } } : null;
  } catch (e) {
    console.warn('Onboarding draft could not be read', e);
    return null;
  }
}

export function saveDraft(draft) {
  try { if (storage()) storage().setItem(DRAFT_KEY, JSON.stringify(draft)); } catch (e) { console.warn('Onboarding draft could not be saved', e); }
  return draft;
}

export function clearDraft() {
  try { if (storage()) storage().removeItem(DRAFT_KEY); } catch (e) { console.warn('Onboarding draft could not be removed', e); }
}

// The finished company stays on the device until the store has taken it
// (store/bridge.js), so nothing is lost if the store cannot write.
export function loadLocalCompany() {
  try {
    const raw = storage() && storage().getItem(LOCAL_COMPANY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('Local company could not be read', e);
    return null;
  }
}

export function clearLocalCompany() {
  try { if (storage()) storage().removeItem(LOCAL_COMPANY_KEY); } catch (e) { console.warn('Local company could not be removed', e); }
}

export function saveLocalCompany(company) {
  try { if (storage()) storage().setItem(LOCAL_COMPANY_KEY, JSON.stringify(company)); } catch (e) { console.warn('Local company could not be saved', e); }
}
