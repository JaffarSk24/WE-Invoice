import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseDeepLink, linkFromArgv, registerDeepLinks } = require('./deep-link.cjs');

describe('weinvoice:// links', () => {
  it('parses route, path and parameters', () => {
    expect(parseDeepLink('weinvoice://invoices/new')).toEqual({ route: 'invoices', path: ['new'], params: {} });
    expect(parseDeepLink('weinvoice://settings?tab=peppol&x=1')).toEqual({ route: 'settings', path: [], params: { tab: 'peppol', x: '1' } });
    expect(parseDeepLink('WEINVOICE://Invoices')).toEqual({ route: 'invoices', path: [], params: {} });
  });

  it('refuses other schemes and odd routes', () => {
    expect(parseDeepLink('https://example.com/')).toBe(null);
    expect(parseDeepLink('weinvoice://')).toBe(null);
    expect(parseDeepLink('weinvoice://1bad')).toBe(null);
    expect(parseDeepLink('')).toBe(null);
    expect(parseDeepLink(null)).toBe(null);
  });

  it('drops unsafe path segments, long values and odd keys', () => {
    const link = parseDeepLink('weinvoice://invoices/..%2F..%2Fetc/new?a=' + 'x'.repeat(300) + '&bad-key=1');
    expect(link.path).toEqual(['new']);
    expect(link.params.a.length).toBe(200);
    expect(link.params['bad-key']).toBe(undefined);
  });

  it('finds the link among process arguments', () => {
    expect(linkFromArgv(['app.exe', '--hidden', 'weinvoice://invoices'])).toBe('weinvoice://invoices');
    expect(linkFromArgv(['app.exe'])).toBe(null);
  });
});

describe('deep link registration', () => {
  function fakeApp(packaged) {
    const handlers = {};
    return {
      isPackaged: packaged,
      setAsDefaultProtocolClient: vi.fn(),
      on: (ev, fn) => { handlers[ev] = fn; },
      handlers
    };
  }

  it('registers the scheme only when packaged and delivers links from both platforms', () => {
    const app = fakeApp(true);
    const onLink = vi.fn();
    const initial = registerDeepLinks(app, onLink, { argv: ['app', 'weinvoice://dashboard'] });
    expect(app.setAsDefaultProtocolClient).toHaveBeenCalledWith('weinvoice');
    expect(initial.route).toBe('dashboard');
    const event = { preventDefault: vi.fn() };
    app.handlers['open-url'](event, 'weinvoice://invoices/new');
    expect(event.preventDefault).toHaveBeenCalled();
    app.handlers['second-instance']({}, ['app', 'weinvoice://settings']);
    app.handlers['second-instance']({}, ['app']);
    app.handlers['open-url']({ preventDefault() {} }, 'weinvoice://');
    expect(onLink.mock.calls.map(c => c[0].route)).toEqual(['invoices', 'settings']);
  });

  it('does not touch the system registration in a dev run', () => {
    const app = fakeApp(false);
    expect(registerDeepLinks(app, () => {}, { argv: [] })).toBe(null);
    expect(app.setAsDefaultProtocolClient).not.toHaveBeenCalled();
  });
});
