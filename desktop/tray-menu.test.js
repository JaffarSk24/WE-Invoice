import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { normalizeTrayState, buildTrayTemplate } = require('./tray-menu.cjs');
const { createTray } = require('./tray.cjs');

const state = {
  show: true, title: '1 240 €', tooltip: 'WE Invoice: k úhrade 1 240 €',
  due: 'K úhrade: 1 240 €', overdue: 'Po splatnosti: 3',
  newInvoice: 'Nová faktúra', receive: 'Prijať eFaktúry', open: 'Otvoriť', quit: 'Ukončiť'
};

describe('tray state', () => {
  it('takes only known fields as text and defaults the rest', () => {
    expect(normalizeTrayState({ show: true, due: 123, bogus: 'x' })).toMatchObject({ show: true, due: '123', tooltip: 'WE Invoice', receiveEnabled: true });
    expect(normalizeTrayState(null).show).toBe(false);
    expect(normalizeTrayState({ show: 'yes' }).show).toBe(false);
    expect(normalizeTrayState({ title: 'x'.repeat(500) }).title.length).toBe(120);
  });
});

describe('tray menu', () => {
  it('lists amounts, actions and quit in the page language', () => {
    const handlers = { action: vi.fn(), open: vi.fn(), quit: vi.fn() };
    const template = buildTrayTemplate(state, handlers);
    expect(template.map(i => i.label || i.type)).toEqual([
      'K úhrade: 1 240 €', 'Po splatnosti: 3', 'separator', 'Nová faktúra', 'Prijať eFaktúry', 'Otvoriť', 'separator', 'Ukončiť'
    ]);
    expect(template[0].enabled).toBe(false);
    template[3].click();
    template[4].click();
    template[5].click();
    template[7].click();
    expect(handlers.action.mock.calls).toEqual([['new-invoice'], ['receive-efaktury']]);
    expect(handlers.open).toHaveBeenCalledTimes(1);
    expect(handlers.quit).toHaveBeenCalledTimes(1);
  });

  it('skips lines without text and can grey out receiving', () => {
    const template = buildTrayTemplate({ show: true, newInvoice: 'New', receive: 'Receive', receiveEnabled: false }, { action() {}, open() {}, quit() {} });
    expect(template.map(i => i.label || i.type)).toEqual(['New', 'Receive', 'separator', 'Quit']);
    expect(template[1].enabled).toBe(false);
  });
});

function fakeElectron(platform) {
  const instances = [];
  class Tray {
    constructor(image) { this.image = image; this.handlers = {}; this.destroyed = false; instances.push(this); }
    on(ev, fn) { this.handlers[ev] = fn; }
    setTitle(title, opts) { this.title = title; this.titleOpts = opts; }
    setToolTip(tip) { this.tooltip = tip; }
    setContextMenu(menu) { this.menu = menu; }
    destroy() { this.destroyed = true; }
  }
  const image = { setTemplateImage: vi.fn(), resize: vi.fn(() => 'resized') };
  const nativeImage = { createFromPath: vi.fn(() => image) };
  const Menu = { buildFromTemplate: (t) => ({ template: t }) };
  const handlers = { action: vi.fn(), open: vi.fn(), quit: vi.fn() };
  const tray = createTray({ Tray, Menu, nativeImage, platform, assetsDir: '/a', iconPath: '/icon.png', handlers });
  return { tray, instances, image, nativeImage, handlers };
}

describe('tray icon', () => {
  it('shows a template image with a title in the macOS menu bar', () => {
    const { tray, instances, image, nativeImage } = fakeElectron('darwin');
    tray.update(state);
    expect(tray.isShown()).toBe(true);
    expect(nativeImage.createFromPath).toHaveBeenCalledWith('/a/trayTemplate.png');
    expect(image.setTemplateImage).toHaveBeenCalledWith(true);
    expect(instances[0].title).toBe('1 240 €');
    expect(instances[0].menu.template.length).toBe(8);
    // A second update reuses the icon.
    tray.update({ ...state, title: '0 €' });
    expect(instances.length).toBe(1);
    expect(instances[0].title).toBe('0 €');
  });

  it('uses the small app icon on Windows and opens the window on click', () => {
    const { tray, instances, image, handlers } = fakeElectron('win32');
    tray.update(state);
    expect(image.resize).toHaveBeenCalledWith({ width: 16, height: 16 });
    expect(instances[0].title).toBe(undefined);
    instances[0].handlers.click();
    expect(handlers.open).toHaveBeenCalled();
  });

  it('goes away when the page hides it', () => {
    const { tray, instances } = fakeElectron('darwin');
    tray.update(state);
    tray.update({ show: false });
    expect(instances[0].destroyed).toBe(true);
    expect(tray.isShown()).toBe(false);
  });
});
