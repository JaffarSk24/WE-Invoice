// Where the dashboard gets its documents: the demo set in demo mode,
// otherwise whatever source the document packages register (the store of
// WP-SYNC through WP-SALES). Without a source the dashboard is empty and
// says so.
import { isDemo, demoData } from '../shell/demo-mode.js';

let source = null;

// source() -> { documents, contacts, accounts?, inboxCount? }
export function setDashboardSource(fn) {
  source = typeof fn === 'function' ? fn : null;
}

export function dashboardData() {
  if (isDemo()) {
    const demo = demoData();
    return { documents: demo.documents, contacts: demo.contacts, accounts: [], inboxCount: 2, demo: true };
  }
  if (!source) return { documents: [], contacts: [], accounts: [], inboxCount: 0, demo: false, empty: true };
  try {
    const data = source() || {};
    return { documents: data.documents || [], contacts: data.contacts || [], accounts: data.accounts || [], inboxCount: data.inboxCount || 0, demo: false };
  } catch (e) {
    console.error('Dashboard source failed', e);
    return { documents: [], contacts: [], accounts: [], inboxCount: 0, demo: false, empty: true };
  }
}
