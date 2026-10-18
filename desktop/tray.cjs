// The tray: an icon in the menu bar of the Mac (a template image, recoloured
// by the system) or in the notification area of Windows, with the amounts
// to collect and quick actions in its menu. The page sends the state and
// the texts in its language (app:tray); the main process only draws.
const path = require('path');
const { normalizeTrayState, buildTrayTemplate } = require('./tray-menu.cjs');

// Native code reads the image and cannot look inside app.asar: the build
// unpacks these files (asarUnpack in package.json).
function unpacked(file) {
  return file.replace('app.asar', 'app.asar.unpacked');
}

function trayImage({ nativeImage, platform, assetsDir, iconPath }) {
  if (platform === 'darwin') {
    const image = nativeImage.createFromPath(unpacked(path.join(assetsDir, 'trayTemplate.png')));
    image.setTemplateImage(true);
    return image;
  }
  return nativeImage.createFromPath(unpacked(iconPath)).resize({ width: 16, height: 16 });
}

// `handlers` = { action(id), open(), quit() }.
function createTray({ Tray, Menu, nativeImage, platform = process.platform, assetsDir, iconPath, handlers }) {
  let tray = null;
  let shown = false;

  function destroy() {
    if (tray) {
      try { tray.destroy(); } catch (e) { console.warn('[tray] destroy failed', e.message); }
      tray = null;
    }
    shown = false;
  }

  function update(input) {
    const state = normalizeTrayState(input);
    if (!state.show) {
      destroy();
      return state;
    }
    try {
      if (!tray) {
        tray = new Tray(trayImage({ nativeImage, platform, assetsDir, iconPath }));
        // A click on the icon opens the window on Windows; macOS opens the menu.
        tray.on('click', () => { if (platform !== 'darwin') handlers.open(); });
      }
      if (platform === 'darwin') tray.setTitle(state.title, { fontType: 'monospacedDigit' });
      tray.setToolTip(state.tooltip);
      tray.setContextMenu(Menu.buildFromTemplate(buildTrayTemplate(state, handlers)));
      shown = true;
    } catch (e) {
      // A tray problem must never stop the app.
      console.error('[tray]', e.message);
      shown = false;
    }
    return state;
  }

  return { update, destroy, isShown: () => shown };
}

module.exports = { createTray, trayImage };
