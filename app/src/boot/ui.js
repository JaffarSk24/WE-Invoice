// Start-up of the ui module (WP-UI): the shell state (company, sync),
// keyboard shortcuts, quick links, and the screens this package owns:
// onboarding, dashboard, settings, help. Called once, in the order of
// boot/index.js, after the language and the transport are ready.
import '../style/forms.css';
import '../style/table.css';
import '../style/onboarding.css';
import '../style/dashboard.css';
import '../style/settings.css';
import { initCompanyState, applySwitched, onCompanyChange } from '../views/shell/company-state.js';
import { initSyncState, onSyncChange } from '../views/shell/sync-state.js';
import { refreshNav, refreshSyncStatus } from '../views/shell/sidebar.js';
import { initHotkeys } from '../views/shell/hotkeys.js';
import { openSearch } from '../views/shell/search.js';
import { initQuickLink } from '../views/shell/quicklink.js';
import { isDemo, demoData } from '../views/shell/demo-mode.js';
import { currentRoute } from '../router.js';
import { renderOnboarding, rememberedCompany } from '../views/onboarding/index.js';
import { renderDashboard } from '../views/dashboard/index.js';
import { renderSettings } from '../views/settings/index.js';
import { renderHelp } from '../views/help/index.js';

export async function boot(ctx) {
  initCompanyState();
  initSyncState();
  onCompanyChange(() => refreshNav(currentRoute()));
  onSyncChange(() => refreshSyncStatus());
  initHotkeys({ emit: ctx.emit, openSearch });

  ctx.registerRoute('onboarding', renderOnboarding);
  ctx.registerRoute('dashboard', renderDashboard);
  ctx.registerRoute('settings', renderSettings);
  ctx.registerRoute('help', renderHelp);

  // The demo company in sample mode, otherwise the store's open company
  // (or the device copy of a wizard the store has not taken yet).
  if (isDemo()) {
    const demo = demoData();
    applySwitched({ company: demo.company, companies: [demo.company] });
  } else {
    const remembered = rememberedCompany();
    if (remembered) applySwitched(remembered);
  }

  // A first start is not redirected: the Overview greets the user with
  // one main action that opens the wizard, and the menu stays usable.
  initQuickLink({ navigate: ctx.navigate, emit: ctx.emit });
}
