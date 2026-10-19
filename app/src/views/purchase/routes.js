// The parts of a purchase route: "#/received/<id>", "#/inbox/<id>",
// "#/expenses/new". The router passes only the first segment.

export function routeParts(hash = typeof window !== 'undefined' ? window.location.hash : '') {
  const parts = String(hash || '').replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] || null, id: parts[1] || null, action: parts[2] || null };
}

export function docHash(route, id) {
  return `${route}/${encodeURIComponent(id)}`;
}
