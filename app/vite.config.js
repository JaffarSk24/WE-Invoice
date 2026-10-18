// Vite builds the same client in two modes:
//   desktop (default)  base "/", out dist/, loaded by Electron
//   web                base "/WE-Invoice/app/", out dist-web/, with a service
//                      worker, published to GitHub Pages
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { serviceWorker } from './build/service-worker.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const PUBLIC_FILES = ['manifest.webmanifest', 'favicon.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];

export default defineConfig(({ mode }) => {
  const web = mode === 'web';
  return {
    root,
    base: web ? '/WE-Invoice/app/' : './',
    publicDir: 'public',
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __WEB_BUILD__: JSON.stringify(web),
      __GATEWAY_URL__: JSON.stringify(process.env.GATEWAY_URL || 'https://invoice-api.whiteeagles.sk')
    },
    plugins: web ? [serviceWorker({ version: pkg.version, publicFiles: PUBLIC_FILES })] : [],
    build: {
      outDir: fileURLToPath(new URL(web ? '../dist-web' : '../dist', import.meta.url)),
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
