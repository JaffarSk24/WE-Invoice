// Service worker of the web build, ported from WE Budget: keeps every built
// file, serves them offline and lets requests to Google and the gateway go
// to the network untouched. The page itself is taken from the network
// first; a new version arrives as a new cache. User data is never cached.

function source(version, files) {
  return `// WE Invoice ${version}
const CACHE = 'we-invoice-${version}';
const FILES = ${JSON.stringify(files)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('we-invoice-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put('./', copy));
        return response;
      })
      .catch(() => caches.match('./')));
    return;
  }
  event.respondWith(caches.match(request).then(hit => hit || fetch(request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(request, copy));
    }
    return response;
  })));
});
`;
}

export function serviceWorker({ version, publicFiles }) {
  return {
    name: 'we-invoice-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter(name => !name.endsWith('.map') && name !== 'index.html' && !/\.woff2?$/.test(name));
      const files = ['./', ...built.map(name => './' + name), ...publicFiles.map(name => './' + name)];
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: source(version, files) });
    }
  };
}
