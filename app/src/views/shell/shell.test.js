// Pure logic of the shell: navigation by company mode, company and sync
// state, keyboard shortcuts, quick links, the promo strip text.
import { describe, it, expect, beforeEach } from 'vitest';
import { NAV, navVisible, visibleNav, navItem } from './nav.js';
import { applySwitched, applyList, currentCompany, companyList, resetCompanyState } from './company-state.js';
import { normalizeSyncStatus, syncIcon, syncTextKey } from './sync-state.js';
import { hotkeyAction, isTypingTarget } from './hotkeys.js';
import { parseQuickLink, stripQuickParams, quickLinkFor } from './quicklink.js';
import { companyOptions } from './sidebar.js';
import { copyrightText } from './promo.js';
import { sk } from '../../i18n/sk/index.js';
import { en } from '../../i18n/en/index.js';

describe('navigation by company mode', () => {
  const tax = NAV.find(g => g.title === 'nav.group.tax').items;
  it('shows everything without a company', () => {
    expect(tax.every(i => navVisible(i, null))).toBe(true);
    expect(visibleNav(null).flatMap(g => g.items).length).toBe(NAV.flatMap(g => g.items).length);
  });
  it('hides VAT items for a non-payer and bookkeeping items for invoicing only', () => {
    const routes = visibleNav({ vatMode: 'NONPAYER', accountingMode: 'NONE' }).flatMap(g => g.items.map(i => i.route));
    expect(routes).not.toContain('kv');
    expect(routes).not.toContain('vat-return');
    expect(routes).not.toContain('cash-journal');
    expect(routes).toContain('invoices');
  });
  it('shows the VAT return but not KV for a § 7 registration', () => {
    const routes = visibleNav({ vatMode: 'REGISTERED_7', accountingMode: 'SIMPLE' }).flatMap(g => g.items.map(i => i.route));
    expect(routes).toContain('vat-return');
    expect(routes).not.toContain('kv');
    expect(routes).toContain('cash-journal');
  });
  it('has the help route with labels in both languages', () => {
    expect(navItem('help')).toBeTruthy();
    expect(sk['nav.help']).toBeTruthy();
    expect(en['nav.help']).toBeTruthy();
  });
});

describe('company state', () => {
  beforeEach(resetCompanyState);
  it('accepts a company alone or with its list', () => {
    applySwitched({ id: 'a', name: 'A' });
    expect(currentCompany().id).toBe('a');
    expect(companyList().map(c => c.id)).toEqual(['a']);
    applySwitched({ company: { id: 'b', name: 'B' }, companies: [{ id: 'a' }, { id: 'b' }] });
    expect(currentCompany().id).toBe('b');
    expect(companyList().length).toBe(2);
    applySwitched(null);
    expect(currentCompany()).toBe(null);
  });
  it('lists companies and offers to add one', () => {
    applyList([{ id: 'x', name: 'X' }]);
    const options = companyOptions(companyList(), null);
    expect(options.map(o => o.value)).toEqual(['x', '__add__']);
    expect(companyOptions([], null)[0].value).toBe('');
  });
});

describe('sync state', () => {
  it('normalizes payloads and unknown statuses', () => {
    expect(normalizeSyncStatus('ok').status).toBe('ok');
    expect(normalizeSyncStatus({ status: 'weird' }).status).toBe('idle');
    // The engine's own states: not signed in is "only on this device".
    expect(['off', 'unavailable', 'checking', 'setup', 'renew', 'locked', 'syncing', 'offline', 'error'].map(s => normalizeSyncStatus({ status: s }).status))
      .toEqual(['local', 'local', 'syncing', 'locked', 'reauth', 'locked', 'syncing', 'offline', 'error']);
    expect(normalizeSyncStatus({ status: 'error', message: 'x' }).message).toBe('x');
    expect(syncIcon('nope')).toBe('cloud');
    expect(sk[syncTextKey('syncing')]).toBeTruthy();
    expect(en[syncTextKey('locked')]).toBeTruthy();
  });
});

describe('hotkeys', () => {
  it('maps keys to actions', () => {
    expect(hotkeyAction({ key: 'k', ctrlKey: true })).toBe('search');
    expect(hotkeyAction({ key: 'K', metaKey: true })).toBe('search');
    expect(hotkeyAction({ key: 's', metaKey: true })).toBe('save');
    expect(hotkeyAction({ key: 'Enter', ctrlKey: true })).toBe('issue');
    expect(hotkeyAction({ key: 'Escape' })).toBe('escape');
    expect(hotkeyAction({ key: 'Escape' }, { modalOpen: true })).toBe(null);
    expect(hotkeyAction({ key: 'n' })).toBe('new');
    expect(hotkeyAction({ key: 'n' }, { typing: true })).toBe(null);
    expect(hotkeyAction({ key: 'n', shiftKey: true })).toBe(null);
    expect(hotkeyAction({ key: 'x' })).toBe(null);
  });
  it('knows where typing happens', () => {
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: 'A' })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('quick links', () => {
  it('reads the quick parameters', () => {
    expect(parseQuickLink('?quick=invoice&contact=Alfa&amount=12,50')).toEqual({ kind: 'invoice', route: 'invoices', contact: 'Alfa', amount: '12.50', note: null });
    expect(parseQuickLink('?quick=scan')).toMatchObject({ route: 'inbox' });
    expect(parseQuickLink('?quick=nothing')).toBe(null);
    expect(parseQuickLink('')).toBe(null);
    expect(parseQuickLink('?quick=invoice&amount=abc').amount).toBe(null);
  });
  it('strips the parameters and builds a link', () => {
    expect(stripQuickParams('https://x.test/app/?quick=invoice&contact=A&x=1#/invoices')).toBe('/app/?x=1#/invoices');
    expect(quickLinkFor('https://x.test/app/', 'invoice', 'Alfa')).toBe('https://x.test/app/?quick=invoice&contact=Alfa');
  });
});

describe('promo strip', () => {
  it('carries the year and the rights text', () => {
    expect(copyrightText(2026)).toContain('2026 White Eagles & Co. s. r. o.');
    expect(sk['footer.visit']).toBeTruthy();
    expect(Object.keys(sk).filter(k => k.startsWith('footer.')).sort()).toEqual(['footer.promo', 'footer.rights', 'footer.visit']);
  });
});
