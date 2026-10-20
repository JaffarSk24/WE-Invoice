// Vite builds the same client in three modes:
//   desktop (default)  base "/", out dist/, loaded by Electron
//   web                base "/WE-Invoice/app/", out dist-web/, with a service
//                      worker, published to GitHub Pages
//   e2e                the web build for the end-to-end tests, out dist-e2e/,
//                      never published: the only difference is a light key
//                      derivation (E2E_KDF_ITERATIONS) so the encryption
//                      scenarios do not spend their time in PBKDF2
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { serviceWorker } from './build/service-worker.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const PUBLIC_FILES = ['manifest.webmanifest', 'favicon.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];
// The OAuth client of the web app (public, drive.file scope). The GitHub
// repository variable GOOGLE_CLIENT_ID overrides it at build time.
const DEFAULT_GOOGLE_CLIENT_ID = '176979689768-bvoi2igmaclfkf3je441kmfvb6vjjfq4.apps.googleusercontent.com';

// PBKDF2 rounds of the e2e build; the minimum the key header accepts.
export const E2E_KDF_ITERATIONS = 1000;

export default defineConfig(({ mode }) => {
  const e2e = mode === 'e2e';
  const web = mode === 'web' || e2e;
  return {
    root,
    base: web ? '/WE-Invoice/app/' : './',
    publicDir: 'public',
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __WEB_BUILD__: JSON.stringify(web),
      __GATEWAY_URL__: JSON.stringify(process.env.GATEWAY_URL || 'https://invoice-api.whiteeagles.sk'),
      __GOOGLE_CLIENT_ID__: JSON.stringify(process.env.GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID),
      __KDF_ITERATIONS__: JSON.stringify(e2e ? E2E_KDF_ITERATIONS : null)
    },
    plugins: web ? [serviceWorker({ version: pkg.version, publicFiles: PUBLIC_FILES })] : [],
    build: {
      outDir: fileURLToPath(new URL(e2e ? '../dist-e2e' : web ? '../dist-web' : '../dist', import.meta.url)),
      emptyOutDir: true,
      target: 'es2022',
      rollupOptions: {
        output: {
          manualChunks: { icons: ['lucide'] }
        }
      }
    },
    server: { port: 5173, strictPort: true }
  };
});
