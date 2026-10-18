// @vitest-environment happy-dom
// The print language in Settings: Slovak by default, a choice of the four
// print languages, an optional second language, saved to the open company.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { printLanguageOptions, printDefaults, saveCompanyDefaults, documentsSection } from './documents-section.js';
import { applySwitched, currentCompany, resetCompanyState, initCompanyState } from '../shell/company-state.js';
import { loadLocalCompany } from '../onboarding/state.js';

const company = (defaults = {}) => ({ id: 'co1', name: 'Firma', defaults: { dueDays: 14, ...defaults } });

beforeEach(() => {
  localStorage.clear();
  resetCompanyState();
  initCompanyState();
});

describe('print language settings', () => {
  it('offers the four print languages under their own names', () => {
    expect(printLanguageOptions().map(o => o.value)).toEqual(['sk', 'cs', 'en', 'de']);
    expect(printLanguageOptions()[0].label).toBe('Slovenčina');
  });

  it('falls back to Slovak and drops a second language equal to the first', () => {
    expect(printDefaults(null)).toEqual({ language: 'sk', secondLanguage: null });
    expect(printDefaults(company({ language: 'ru' }))).toEqual({ language: 'sk', secondLanguage: null });
    expect(printDefaults(company({ language: 'de', secondLanguage: 'de' }))).toEqual({ language: 'de', secondLanguage: null });
    expect(printDefaults(company({ language: 'sk', secondLanguage: 'en' }))).toEqual({ language: 'sk', secondLanguage: 'en' });
  });

  it('saves to the device copy when the store does not hold the company', async () => {
    applySwitched({ company: company({ language: 'sk' }), companies: [company()] });
    const next = await saveCompanyDefaults({ language: 'en', secondLanguage: null }, { store: null });
    expect(next.defaults).toMatchObject({ dueDays: 14, language: 'en', secondLanguage: null });
    expect(loadLocalCompany().defaults.language).toBe('en');
    expect(currentCompany().defaults.language).toBe('en');
  });

  it('saves through the store when it holds the open company', async () => {
    applySwitched({ company: company(), companies: [company()] });
    const store = { company: () => ({ id: 'co1' }), updateCompany: vi.fn(async (patch) => ({ ...company(), ...patch })) };
    const next = await saveCompanyDefaults({ language: 'de' }, { store });
    expect(store.updateCompany).toHaveBeenCalledWith({ defaults: { dueDays: 14, language: 'de' } });
    expect(next.defaults.language).toBe('de');
    expect(loadLocalCompany()).toBe(null);
  });

  it('shows Slovak selected for a new company and no selects without one', () => {
    const empty = document.createElement('div');
    documentsSection(empty, { redraw: () => {} });
    expect(empty.querySelector('#settings-print-language')).toBe(null);
    applySwitched({ company: company(), companies: [company()] });
    const root = document.createElement('div');
    documentsSection(root, { redraw: () => {} });
    expect(root.querySelector('#settings-print-language').value).toBe('sk');
    const second = root.querySelector('#settings-print-second');
    expect(second.value).toBe('');
    expect(Array.from(second.options).map(o => o.value)).toEqual(['', 'cs', 'en', 'de']);
  });
});
