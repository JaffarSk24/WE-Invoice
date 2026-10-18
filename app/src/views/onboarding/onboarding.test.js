// The wizard logic: steps by mode, checks, resume, company record, the
// register lookup through a fake transport, the validators that wait for
// the core, and the demo data.
import { describe, it, expect, beforeEach } from 'vitest';
import { STEPS, EMPTY_DRAFT, nextStep, prevStep, stepErrors, accountingModesFor, draftToCompany, saveDraft, loadDraft, clearDraft, progress, normalizeIban } from './state.js';
import { lookupCompany, lookupToDraft, mapLegalForm } from './lookup.js';
import { checkIco, checkIban, suggestBic } from './validators.js';
import { buildDemoData, seeded } from './demo.js';
import { schema } from '@we-invoice/core';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const draft = (patch = {}) => ({ ...EMPTY_DRAFT, address: { ...EMPTY_DRAFT.address }, ...patch });

describe('wizard steps', () => {
  it('walks every step for a Google sign-in', () => {
    const d = draft({ signIn: 'google' });
    const seen = ['language'];
    let s = 'language';
    while ((s = nextStep(s, d))) seen.push(s);
    expect(seen).toEqual(STEPS);
  });
  it('skips encryption without Drive and everything in demo mode', () => {
    expect(nextStep('signin', draft({ signIn: 'local' }))).toBe('company');
    expect(nextStep('signin', draft({ signIn: 'demo' }))).toBe('done');
    expect(prevStep('done', draft({ signIn: 'demo' }))).toBe('signin');
    expect(progress('signin', draft({ signIn: 'demo' }))).toEqual({ index: 2, total: 3 });
  });
  it('offers an s. r. o. only invoicing or an accountant', () => {
    expect(accountingModesFor('SRO')).toEqual(['NONE', 'EXTERNAL']);
    expect(accountingModesFor('FO_ZIVNOST')).toContain('SIMPLE');
    expect(stepErrors('accounting', draft({ legalForm: 'SRO', accountingMode: 'SIMPLE' }))).toEqual(['onboarding.error.accountingMode']);
  });
  it('stops on a missing name, a bad IČO or IBAN', () => {
    expect(stepErrors('company', draft({ name: '' }))).toContain('onboarding.error.nameRequired');
    expect(stepErrors('company', draft({ name: 'A', ico: '12' }))).toContain('onboarding.error.icoFormat');
    expect(stepErrors('company', draft({ name: 'A', ico: '' }))).toEqual([]);
    expect(stepErrors('bank', draft({ iban: 'XX' }))).toContain('onboarding.error.ibanFormat');
    expect(stepErrors('signin', draft())).toEqual(['onboarding.error.chooseSignIn']);
    expect(normalizeIban(' sk31 1200 0000 ')).toBe('SK3112000000');
  });
});

describe('resume', () => {
  beforeEach(() => localStorage.clear());
  it('keeps the draft on the device', () => {
    expect(loadDraft()).toBe(null);
    saveDraft(draft({ step: 'vat', name: 'Firma' }));
    expect(loadDraft()).toMatchObject({ step: 'vat', name: 'Firma' });
    clearDraft();
    expect(loadDraft()).toBe(null);
  });
  it('survives a broken draft', () => {
    localStorage.setItem('we-invoice-onboarding', '{broken');
    expect(loadDraft()).toBe(null);
  });
});

describe('company record', () => {
  it('fits the Company schema fields', () => {
    const c = draftToCompany(draft({ name: ' Firma ', legalForm: 'SRO', iban: 'SK3112000000198742637541', accountingMode: 'EXTERNAL' }), { id: 'c1', now: '2026-10-18T10:00:00.000Z' });
    expect(c.name).toBe('Firma');
    expect(c.taxpayerType).toBe('PO');
    expect(c.bankAccounts[0]).toMatchObject({ iban: 'SK3112000000198742637541', currency: 'EUR', isDefault: true });
    const companySchema = Object.values(schema.SCHEMAS).find(x => x.title === 'Company');
    const ajv = new Ajv({ strict: false, allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(companySchema);
    expect(validate(c), JSON.stringify(validate.errors)).toBe(true);
  });
});

function fakeTransport(status, body, { fail = false } = {}) {
  const calls = [];
  return {
    calls,
    gatewayUrl: (p) => `https://gw.test${p}`,
    http: async (req) => {
      calls.push(req);
      if (fail) throw new Error('network');
      return { status, ok: status >= 200 && status < 300, json: async () => body };
    }
  };
}

describe('register lookup', () => {
  const answer = {
    name: 'Alfa, s. r. o.', ico: '12345678', dic: '2020000001', icDph: 'SK2020000001', legalForm: null, legalFormText: 'Spoločnosť s ručením obmedzeným',
    registerEntry: 'OR OS BA I, Sro 1/B', country: 'SK', address: { street: 'Hlavná 1', city: 'Bratislava', zip: '81101', country: 'SK' }, source: 'RPO'
  };
  it('calls the gateway and maps the answer', async () => {
    const tr = fakeTransport(200, answer);
    const d = await lookupCompany(tr, '12345678');
    expect(tr.calls[0].url).toBe('https://gw.test/v1/company/sk/12345678');
    expect(d).toMatchObject({ name: 'Alfa, s. r. o.', legalForm: 'SRO', vatMode: 'PAYER', address: { city: 'Bratislava' } });
  });
  it('reports not found, upstream errors and a bad IČO by code', async () => {
    await expect(lookupCompany(fakeTransport(404, {}), '12345678')).rejects.toMatchObject({ code: 'COMPANY_NOT_FOUND' });
    await expect(lookupCompany(fakeTransport(502, {}), '12345678')).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
    await expect(lookupCompany(fakeTransport(200, {}, { fail: true }), '12345678')).rejects.toMatchObject({ code: expect.stringMatching(/UPSTREAM_UNAVAILABLE|OFFLINE/) });
    await expect(lookupCompany(fakeTransport(200, answer), '12')).rejects.toMatchObject({ code: 'ICO_FORMAT' });
  });
  it('guesses the legal form from its text', () => {
    expect(mapLegalForm({ legalForm: 'AS' })).toBe('AS');
    expect(mapLegalForm({ legalFormText: 'Akciová spoločnosť' })).toBe('AS');
    expect(mapLegalForm({ legalFormText: 'Podnikateľ-fyzická osoba-nezapísaný v obchodnom registri' })).toBe('FO_ZIVNOST');
    expect(mapLegalForm({ legalFormText: 'Občianske združenie' })).toBe('NGO');
    expect(mapLegalForm({})).toBe('OTHER');
    expect(lookupToDraft({ name: 'X', country: 'SK' }).vatMode).toBe('NONPAYER');
  });
});

describe('validators waiting for the core', () => {
  it('rejects a wrong shape and answers unknown or a result for the rest', () => {
    expect(checkIco('12')).toBe(false);
    expect([null, true, false]).toContain(checkIco('12345678'));
    expect(checkIban('SK31')).toBe(false);
    expect([null, true, false]).toContain(checkIban('SK3112000000198742637541'));
    const bic = suggestBic('SK3112000000198742637541');
    expect(bic === null || typeof bic === 'string').toBe(true);
  });
});

describe('demo data', () => {
  const names = { company: 'Demo', contacts: Array.from({ length: 10 }, (_, i) => `C${i}`), cities: ['A', 'B', 'C'] };
  it('is one company, ten contacts and thirty documents, the same every time', () => {
    const a = buildDemoData(names, '2026-10-18');
    const b = buildDemoData(names, '2026-10-18');
    expect(a.contacts).toHaveLength(10);
    expect(a.documents).toHaveLength(30);
    expect(a).toEqual(b);
    a.documents.forEach(d => {
      expect(d.totalGross).toMatch(/^\d+\.\d{2}$/);
      if (d.status === 'OVERDUE') expect(d.dueDate < '2026-10-18').toBe(true);
    });
    expect(seeded(1)()).toBe(seeded(1)());
  });
});
