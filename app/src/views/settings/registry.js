// The sections of Settings (03-features.md § 3.17) and the registry the
// other packages fill: registerSettingsSection('peppol', render) replaces
// the placeholder of a section with the package's own form. A section
// that nobody registered shows its description and an empty container
// with the id settings-<section>, which a package may also fill later.
export const SETTINGS_SECTIONS = Object.freeze([
  { id: 'company', icon: 'building-2' },
  { id: 'documents', icon: 'file-text' },
  { id: 'email', icon: 'mail' },
  { id: 'peppol', icon: 'send' },
  { id: 'reminders', icon: 'bell-ring' },
  { id: 'sync', icon: 'cloud' },
  { id: 'exim', icon: 'archive' },
  { id: 'interface', icon: 'palette' },
  { id: 'notifications', icon: 'bell' },
  { id: 'about', icon: 'info' }
]);

const renderers = new Map();

export function registerSettingsSection(id, render) {
  if (!SETTINGS_SECTIONS.some(s => s.id === id)) throw new Error(`Unknown settings section ${id}`);
  renderers.set(id, render);
}

export function settingsRenderer(id) {
  return renderers.get(id) || null;
}

export function isSettingsSection(id) {
  return SETTINGS_SECTIONS.some(s => s.id === id);
}

// For tests.
export function resetSettingsRegistry() {
  renderers.clear();
}
