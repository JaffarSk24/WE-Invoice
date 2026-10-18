// Device-local options of the desktop app, kept with the interface
// preferences (they belong to this computer, not to the company data):
// the tray icon on or off and the SMTP account without its password, which
// the system keychain holds.
import { getPrefs, setPref } from '../prefs.js';

export const SMTP_DEFAULTS = Object.freeze({ host: '', port: 587, security: 'starttls', user: '', from: '', fromName: '' });
const DEFAULTS = Object.freeze({ tray: true, smtp: SMTP_DEFAULTS });

export function getDesktopPrefs() {
  const saved = getPrefs().desktop;
  const d = saved && typeof saved === 'object' ? saved : {};
  return { tray: d.tray !== false, smtp: { ...SMTP_DEFAULTS, ...(d.smtp && typeof d.smtp === 'object' ? d.smtp : {}) } };
}

export function setDesktopPref(name, value) {
  if (!(name in DEFAULTS)) throw new Error(`Unknown desktop preference: ${name}`);
  const next = { ...getDesktopPrefs(), [name]: value };
  setPref('desktop', next);
  return next;
}

// True when the SMTP account is complete enough to send with.
export function smtpConfigured(smtp) {
  return Boolean(smtp && smtp.host && smtp.port && smtp.from);
}
