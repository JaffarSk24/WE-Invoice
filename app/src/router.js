// Navigation by URL hash (#/invoices). Views register a render function;
// an unknown route falls back to the dashboard. Setting the same hash again
// fires no event, so navigate() renders directly in that case.

const routes = new Map();
let onRoute = null;
let fallback = 'dashboard';

export function registerRoute(name, render) {
  routes.set(name, render);
}

export function hasRoute(name) {
  return routes.has(name);
}

export function routeFromHash(hash) {
  const name = String(hash || '').replace(/^#\/?/, '').split(/[/?]/)[0];
  return name || null;
}

export function currentRoute() {
  const name = routeFromHash(window.location.hash);
  return name && routes.has(name) ? name : fallback;
}

export function startRouter({ defaultRoute = 'dashboard', onChange }) {
  fallback = defaultRoute;
  onRoute = onChange;
  window.addEventListener('hashchange', () => onRoute(currentRoute(), routes.get(currentRoute())));
  onRoute(currentRoute(), routes.get(currentRoute()));
}

export function navigate(name) {
  if (routeFromHash(window.location.hash) === name) {
    if (onRoute) onRoute(currentRoute(), routes.get(currentRoute()));
  } else {
    window.location.hash = `#/${name}`;
  }
}
