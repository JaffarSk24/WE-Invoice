// The menu of the tray icon, built from the state the page sends. Texts
// come from the page in its language (the main process has no dictionary),
// so the state carries ready labels: "K úhrade: 1 240 €", "Po splatnosti:
// 3", "Nová faktúra", "Prijať eFaktúry", "Otvoriť", "Ukončiť". Pure, so it
// is tested without Electron.

const ACTIONS = Object.freeze(['new-invoice', 'receive-efaktury']);

// What the page may send; anything else is ignored.
function normalizeTrayState(state) {
  const s = state && typeof state === 'object' ? state : {};
  const text = (v) => (v == null ? '' : String(v)).slice(0, 120);
  return {
    show: s.show === true,
    title: text(s.title),
    tooltip: text(s.tooltip) || 'WE Invoice',
    due: text(s.due),
    overdue: text(s.overdue),
    newInvoice: text(s.newInvoice),
    receive: text(s.receive),
    receiveEnabled: s.receiveEnabled !== false,
    open: text(s.open),
    quit: text(s.quit)
  };
}

// The Electron menu template. `handlers` = { action(id), open(), quit() }.
function buildTrayTemplate(state, handlers) {
  const s = normalizeTrayState(state);
  const template = [];
  if (s.due) template.push({ label: s.due, enabled: false });
  if (s.overdue) template.push({ label: s.overdue, enabled: false });
  if (template.length) template.push({ type: 'separator' });
  if (s.newInvoice) template.push({ label: s.newInvoice, click: () => handlers.action('new-invoice') });
  if (s.receive) template.push({ label: s.receive, enabled: s.receiveEnabled, click: () => handlers.action('receive-efaktury') });
  if (s.open) template.push({ label: s.open, click: () => handlers.open() });
  template.push({ type: 'separator' });
  template.push({ label: s.quit || 'Quit', click: () => handlers.quit() });
  return template;
}

module.exports = { ACTIONS, normalizeTrayState, buildTrayTemplate };
