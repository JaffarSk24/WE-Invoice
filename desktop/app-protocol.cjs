// The app:// scheme serves the built client (dist/) to the window: a stable
// origin and no open port, as in WE Budget. Paths outside dist/ are refused.
const path = require('path');
const fs = require('fs');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm'
};

// Resolves a request path to a file inside root, or null when it escapes.
function resolveInRoot(root, pathname) {
  let p = decodeURIComponent(pathname || '/');
  if (p === '/' || p === '') p = '/index.html';
  const file = path.normalize(path.join(root, p));
  if (file !== root && !file.startsWith(root + path.sep)) return null;
  return file;
}

function registerAppProtocol(protocol, distRoot) {
  protocol.handle('app', (request) => {
    try {
      let file = resolveInRoot(distRoot, new URL(request.url).pathname);
      if (!file) return new Response('Forbidden', { status: 403 });
      if (!fs.existsSync(file)) file = path.join(distRoot, 'index.html');
      const mime = MIME[path.extname(file)] || 'application/octet-stream';
      return new Response(fs.readFileSync(file), { headers: { 'Content-Type': mime } });
    } catch (e) {
      console.error('app:// handler error:', e);
      return new Response('Internal error', { status: 500 });
    }
  });
}

module.exports = { registerAppProtocol, resolveInRoot, MIME };
