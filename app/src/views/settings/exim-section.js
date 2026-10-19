// The "Export a import" section of Settings: the full backup and restore
// right here, and a way to the screen with the accountant package, the
// migration from other programs and the WE line integrations.
import { h, append } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { navigate } from '../../router.js';

export function eximSection(root, deps = {}) {
  const links = ['export', 'import', 'tracker'].map(tab => h('button', {
    type: 'button', class: 'btn btn-sm', id: `settings-exim-${tab}`, onclick: () => navigate(`exim/${tab}`)
  }, t(`exim.tab.${tab}`)));
  const backup = h('div', { class: 'settings-section', id: 'settings-exim-backup' });
  append(root, [
    h('p', { class: 'muted' }, t('settings.section.exim.text')),
    h('div', { class: 'exim-actions' }, links),
    backup]);
  // The backup panel and its styles load on first use.
  return import('../exim/backup-section.js')
    .then(mod => mod.renderBackupSection(backup, deps))
    .catch(e => {
      console.error('Backup section could not be loaded', e);
      append(backup, [h('p', { class: 'callout callout-danger', role: 'alert' }, t('errors.UNKNOWN'))]);
    });
}
