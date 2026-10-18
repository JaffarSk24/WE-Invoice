// Saving the eFaktúra settings of the open company (company.peppol and
// company.defaults) through the store, and the card every wizard step is
// drawn in.
import { h } from '../../ui/dom.js';
import { emit } from '../../events.js';
import { hasStore, getStore } from '../../store/index.js';
import { currentCompany, companyList } from '../shell/company-state.js';
import { PeppolError } from '../../peppol/errors.js';

/** Saves company.peppol (merged) through the store of the open company. */
export async function savePeppolSettings(patch, { store = hasStore() ? getStore() : null } = {}) {
  const company = currentCompany();
  if (!store || !company || store.company()?.id !== company.id) throw new PeppolError('PEPPOL_NOT_ALLOWED', 'the company is not in the store');
  const next = await store.updateCompany({ peppol: { ...(store.company().peppol || {}), ...patch } });
  emit('company:switched', { company: next, companies: companyList().map(c => (c.id === next.id ? next : c)) });
  return next;
}

/** Saves company.defaults (merged), e.g. attachPdfToEInvoice. */
export async function saveCompanyDefaultsPatch(patch, { store = hasStore() ? getStore() : null } = {}) {
  const company = currentCompany();
  if (!store || !company || store.company()?.id !== company.id) throw new PeppolError('PEPPOL_NOT_ALLOWED', 'the company is not in the store');
  const next = await store.updateCompany({ defaults: { ...(store.company().defaults || {}), ...patch } });
  emit('company:switched', { company: next, companies: companyList().map(c => (c.id === next.id ? next : c)) });
  return next;
}

export function stepCard(id, title, ...children) {
  return h('section', { class: 'card peppol-step', dataset: { step: id }, 'aria-labelledby': `peppol-step-${id}` },
    h('h3', { id: `peppol-step-${id}` }, title), ...children);
}

