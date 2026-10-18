// Start-up of the exim module (WP-EXIM): registers the "Export a import"
// screen (#/exim, not in the menu yet) over the placeholders and its
// section of Settings. Both load their code on first use. Called once, in
// the order of boot/index.js, after the language and the transport are
// ready.
import { registerSettingsSection } from '../views/settings/registry.js';
import { eximSection } from '../views/settings/exim-section.js';

export async function boot(ctx) {
  const deps = { transport: ctx.transport };
  ctx.registerRoute('exim', (root) => {
    import('../views/exim/index.js')
      .then(mod => mod.renderExim(root, deps))
      .catch(e => ctx.showError(e));
  });
  registerSettingsSection('exim', (root) => eximSection(root, deps));
}
