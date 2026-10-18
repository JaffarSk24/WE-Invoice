import { describe, it, expect } from 'vitest';
import { buildTrayState, formatAmount, TRAY_ACTIONS } from './tray-state.js';
import { sk } from '../i18n/sk/index.js';

const t = (key, params) => (sk[key] || key).replace(/\{(\w+)\}/g, (m, n) => (params && params[n] !== undefined ? String(params[n]) : m));

describe('tray amounts', () => {
  it('formats money by language from a decimal string', () => {
    expect(formatAmount('1240.50', 'EUR', 'sk')).toMatch(/1\s?240,50\s€/);
    expect(formatAmount('1240.50', 'EUR', 'sk', { decimals: 0 })).toMatch(/1\s?241\s€/);
    expect(formatAmount('12.00', 'CZK', 'cs')).toMatch(/12,00\s?Kč/);
    expect(formatAmount('abc', 'EUR', 'sk')).toBe('');
    expect(formatAmount(undefined, 'EUR', 'en')).toBe('');
  });
});

describe('tray state', () => {
  it('carries Slovak texts with the amounts filled in', () => {
    const state = buildTrayState({ show: true, dueTotal: '1240.00', currency: 'EUR', overdueCount: 3, canReceive: true }, t, 'sk');
    expect(state.show).toBe(true);
    expect(state.due).toMatch(/^K úhrade: 1\s?240,00\s€$/);
    expect(state.overdue).toBe('Po splatnosti: 3');
    expect(state.title).toMatch(/^1\s?240\s€$/);
    expect(state.newInvoice).toBe('Nová faktúra');
    expect(state.receive).toBe('Prijať eFaktúry');
    expect(state.receiveEnabled).toBe(true);
    expect(state.open).toBe('Otvoriť WE Invoice');
    expect(state.quit).toBe('Ukončiť');
  });

  it('leaves out lines without data and greys out receiving without a provider', () => {
    const state = buildTrayState({ show: true }, t, 'sk');
    expect(state.due).toBe('');
    expect(state.overdue).toBe('');
    expect(state.title).toBe('');
    expect(state.tooltip).toBe('WE Invoice');
    expect(state.receiveEnabled).toBe(false);
    expect(buildTrayState({ show: false }, t, 'sk').show).toBe(false);
    expect(buildTrayState(null, t, 'sk').show).toBe(true);
  });

  it('maps tray actions to routes and events', () => {
    expect(TRAY_ACTIONS['new-invoice']).toEqual({ route: 'invoices', event: 'invoice:new' });
    expect(TRAY_ACTIONS['receive-efaktury'].route).toBe('efaktury-in');
  });
});
