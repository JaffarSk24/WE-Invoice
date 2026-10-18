// Renders assets/icon.svg into the PNG files the app, the web build and the
// installers use. Runs in Electron, so the drawing goes through the same
// Chromium renderer as the app (gradients and shadows exactly as drawn):
//   npx electron desktop/scripts/render-icon.cjs
// The desktop icon is a rounded tile with a margin and a shadow, as macOS
// wants it. A phone cuts its own shape out of a full square, so the phone
// icons are the same drawing on a full-bleed tile, enlarged to the size it
// has inside the tile; the maskable one keeps it inside the safe circle.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const svg = fs.readFileSync(path.join(root, 'assets', 'icon.svg'), 'utf8');

function phoneSvg(scale) {
  const TILE = /<rect x="100" y="100" width="824" height="824" rx="185" fill="#2e354f" filter="url\(#tile-shadow\)"\/>\s*<rect x="100" y="100" width="824" height="824" rx="185" fill="url\(#tile-light\)"\/>/;
  if (!TILE.test(svg)) throw new Error('assets/icon.svg changed: the tile rectangles were not found');
  const [head, rest] = svg.split(TILE);
  const body = rest.replace(/<\/svg>\s*$/, '');
  return `${head}<rect width="1024" height="1024" fill="#2e354f"/><rect width="1024" height="1024" fill="url(#tile-light)"/>`
    + `<g transform="translate(512 512) scale(${scale}) translate(-512 -512)">${body}</g></svg>`;
}

const OUTPUTS = [
  { file: 'icon.png', size: 1024, svg },
  { file: path.join('app', 'public', 'favicon.png'), size: 128, svg },
  { file: path.join('app', 'public', 'apple-touch-icon.png'), size: 180, svg: phoneSvg(1.12) },
  { file: path.join('app', 'public', 'icon-192.png'), size: 192, svg: phoneSvg(1.12) },
  { file: path.join('app', 'public', 'icon-512.png'), size: 512, svg: phoneSvg(1.12) },
  { file: path.join('app', 'public', 'icon-maskable-512.png'), size: 512, svg: phoneSvg(1) }
];

app.disableHardwareAcceleration();
// Retina screens would otherwise double every pixel size.
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  for (const { file, size, svg: source } of OUTPUTS) {
    const win = new BrowserWindow({
      width: size, height: size, show: false, frame: false, transparent: true,
      backgroundColor: '#00000000', webPreferences: { offscreen: true }
    });
    const sized = source.replace('width="1024" height="1024"', `width="${size}" height="${size}"`);
    const html = `<html><body style="margin:0;background:transparent;overflow:hidden">${sized}</body></html>`;
    const tmp = path.join(app.getPath('temp'), `we-invoice-icon-${size}.html`);
    fs.writeFileSync(tmp, html, 'utf8');
    await win.loadFile(tmp);
    await new Promise(r => setTimeout(r, 400));
    const captured = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
    const image = captured.getSize().width === size ? captured : captured.resize({ width: size, height: size, quality: 'best' });
    fs.writeFileSync(path.join(root, file), image.toPNG());
    console.info('wrote', file, image.getSize());
    win.destroy();
    fs.unlinkSync(tmp);
  }
  app.quit();
});
