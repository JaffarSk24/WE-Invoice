// The dashboard layout as data: which widgets exist, their order and
// which are hidden. Pure functions; the view keeps the result in the
// device preferences.
export const WIDGETS = Object.freeze([
  'quickActions', 'issued', 'unpaid', 'vatThreshold', 'taxCalendar', 'topClients', 'topDebtors', 'balance', 'efaktury', 'accounts'
]);

export const DEFAULT_LAYOUT = Object.freeze({ order: WIDGETS.slice(), hidden: [] });

// A saved layout made valid again: unknown ids dropped, new widgets added
// at the end, hidden ids kept only when they exist.
export function normalizeLayout(saved) {
  const order = Array.isArray(saved && saved.order) ? saved.order.filter((id, i, arr) => WIDGETS.includes(id) && arr.indexOf(id) === i) : [];
  WIDGETS.forEach(id => { if (!order.includes(id)) order.push(id); });
  const hidden = Array.isArray(saved && saved.hidden) ? saved.hidden.filter(id => WIDGETS.includes(id)) : [];
  return { order, hidden };
}

export function visibleWidgets(layout) {
  return layout.order.filter(id => !layout.hidden.includes(id));
}

export function moveWidget(layout, id, delta) {
  const order = layout.order.slice();
  const from = order.indexOf(id);
  if (from < 0) return layout;
  const visible = visibleWidgets(layout);
  const vi = visible.indexOf(id);
  const target = visible[vi + delta];
  if (!target) return layout;
  const to = order.indexOf(target);
  order.splice(from, 1);
  order.splice(to, 0, id);
  return { ...layout, order };
}

// Places `id` where `beforeId` is (drag and drop).
export function placeWidget(layout, id, beforeId) {
  if (id === beforeId) return layout;
  const order = layout.order.filter(w => w !== id);
  const at = beforeId ? order.indexOf(beforeId) : order.length;
  order.splice(at < 0 ? order.length : at, 0, id);
  return { ...layout, order };
}

export function hideWidget(layout, id) {
  return layout.hidden.includes(id) ? layout : { ...layout, hidden: [...layout.hidden, id] };
}

export function showWidget(layout, id) {
  return { ...layout, hidden: layout.hidden.filter(w => w !== id) };
}
