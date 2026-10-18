// The "Export a import" screen (#/exim, #/exim/<tab>): the accountant
// package and the WE Budget CSV, import and migration, the WE Time Tracker
// integration and the full backup. Loaded lazily, with its own styles, so
// none of it weighs on the start of the app.
import '../../style/exim.css';
import { h } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { createTabs } from '../../components/tabs.js';
import { renderExportPanel } from './export-panel.js';
import { renderImportPanel } from './import-panel.js';
import { renderBackupPanel } from './backup-panel.js';
import { renderTrackerPanel } from './tracker-panel.js';

export const TABS = Object.freeze(['export', 'import', 'tracker', 'backup']);

export function tabFromHash(hash = typeof window !== 'undefined' ? window.location.hash : '') {
  const tab = String(hash || '').replace(/^#\/?/, '').split(/[/?]/)[1];
  return TABS.includes(tab) ? tab : 'export';
}

const RENDER = { export: renderExportPanel, import: renderImportPanel, tracker: renderTrackerPanel, backup: renderBackupPanel };

export function renderExim(root, deps = {}) {
  const tabs = createTabs({
    cls: 'exim-tabs',
    active: tabFromHash(),
    tabs: TABS.map(id => ({ id, label: t(`exim.tab.${id}`), render: (panel) => { RENDER[id](panel, deps); refreshIcons(panel); } })),
    onChange: (id) => {
      const next = `#/exim/${id}`;
      if (typeof window !== 'undefined' && window.location.hash !== next) window.history.replaceState(null, '', next);
    }
  });
  root.append(
    h('header', { class: 'view-header' }, h('h1', {}, t('exim.title'))),
    h('p', { class: 'muted exim-intro' }, t('exim.intro')),
    tabs.el);
  refreshIcons(root);
}
