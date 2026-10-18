// English texts: onboarding, dashboard, settings, components (WP-UI). One
// file per screen, merged here; a key lives in exactly one of them.
import components from './ui/components.js';
import onboarding from './ui/onboarding.js';
import dashboard from './ui/dashboard.js';
import settings from './ui/settings.js';
import help from './ui/help.js';

export default { ...components, ...onboarding, ...dashboard, ...settings, ...help };
