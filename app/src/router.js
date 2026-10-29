// Navigation by URL hash (#/invoices). Views register a render function;
// an unknown route falls back to the dashboard. Setting the same hash again
// fires no event, so navigate() renders directly in that case. "The same"
// is the whole path: from "#/received/abc" to "received" the hash changes,
// or the back button would draw the same card again.

const routes = new Map();
let onRoute = null;
let fallback = 'dashboard';

export function registerRoute(name, render) {
  routes.set(name, render);
}

export function routeRender(name) {
  return routes.get(name) || null;
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

/** Draws the current screen again, sub-path and all. */
export function refreshRoute() {
  if (onRoute) onRoute(currentRoute(), routes.get(currentRoute()));
}

export function navigate(path) {
  if (String(window.location.hash || '').replace(/^#\/?/, '') === path) {
    refreshRoute();
  } else {
    window.location.hash = `#/${path}`;
  }
}
