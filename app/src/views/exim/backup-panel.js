// "Záloha": the whole data of the open company in one file, optionally
// with a password, and the way back. A restore shows what the file holds,
// can save the current data first and needs an explicit "I understand";
// a file that is damaged, foreign or newer than the app replaces nothing.
import { h, clear } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { showToast, showError } from '../../ui/toast.js';
import { openModal } from '../../ui/modal.js';
import { confirmIrreversible } from '../../components/confirm-irreversible.js';
import { formatDateTime } from '../../components/dates.js';
import { planRestore, SCHEMA_VERSION, exportFileName } from './core-bridge.js';
import { eximSource } from './source.js';
import { backupText, readBackup, isEncryptedBackup, MIN_PASSWORD } from './backup-file.js';
import { saveFile, pickFiles } from './files.js';
import { replaceCompanyData, withAudit } from './store-bulk.js';
import { errorText } from './labels.js';

function askPassword() {
  return new Promise(resolve => {
    let done = false;
    const input = h('input', { type: 'password', id: 'exim-backup-unlock', autocomplete: 'current-password' });
    openModal({
      title: t('exim.backup.passwordTitle'),
      body: h('div', { class: 'field' }, h('label', { for: 'exim-backup-unlock' }, t('exim.backup.password')), input),
      onClose: () => { if (!done) resolve(null); },
      actions: [
        { label: t('common.cancel'), onClick: (m) => m.close() },
        { label: t('common.ok'), kind: 'primary', onClick: (m) => { done = true; resolve(input.value); m.close(); } }
      ]
    });
  });
}

// A company record for a backup restored where no company is open yet.
export async function createCompanyFor(store, backup) {
  const fields = { ...(backup.data.company || {}) };
  ['id', 'createdAt', 'updatedAt', 'deleted'].forEach(k => { delete fields[k]; });
  return store.createCompany({ ...fields, name: fields.name || backup.companyName || '' });
}

export function fileNameFor(company, now = new Date()) {
  return `${t('exim.file.backup')}_${exportFileName(company && company.name, 'company')}_${now.toISOString().slice(0, 10)}.json`;
}

async function downloadBackup(source, password, transport) {
  const text = await backupText(source.store.data, { password });
  await saveFile(fileNameFor(source.company), text, 'application/json', transport);
}

export function renderBackupPanel(panel, deps = {}) {
  const source0 = eximSource();
  const canBackup = Boolean(source0.store && source0.store.data) && !source0.demo;
  const password = h('input', { type: 'password', id: 'exim-backup-password', autocomplete: 'new-password', minlength: MIN_PASSWORD });
  const repeat = h('input', { type: 'password', id: 'exim-backup-repeat', autocomplete: 'new-password' });
  const saveButton = h('button', { type: 'button', class: 'btn btn-primary', id: 'exim-backup-save', disabled: !canBackup }, t('exim.backup.save'));
  saveButton.addEventListener('click', async () => {
    const source = eximSource();
    if (password.value && password.value !== repeat.value) return showToast(t('exim.backup.mismatch'), { type: 'error' });
    if (password.value && password.value.length < MIN_PASSWORD) return showToast(t('errors.BACKUP_PASSWORD_SHORT'), { type: 'error' });
    try {
      saveButton.disabled = true;
      await downloadBackup(source, password.value || null, deps.transport);
      showToast(t('exim.backup.saved'), { type: 'success' });
    } catch (e) {
      showError(e, 'errors.BACKUP_FAILED');
    } finally {
      saveButton.disabled = false;
    }
  });

  const restoreInfo = h('div', { class: 'exim-restore', id: 'exim-restore-info', 'aria-live': 'polite' });
  const openButton = h('button', { type: 'button', class: 'btn', id: 'exim-backup-open' }, t('exim.backup.open'));
  openButton.addEventListener('click', async () => {
    clear(restoreInfo);
    try {
      const [file] = await pickFiles({ accept: '.json,application/json' }, deps.transport);
      if (!file) return;
      const text = await file.text();
      const pass = isEncryptedBackup(text) ? await askPassword() : null;
      if (isEncryptedBackup(text) && !pass) return;
      showRestore(await readBackup(text, pass), deps);
    } catch (e) {
      console.error('Backup file refused', e);
      restoreInfo.append(h('p', { class: 'callout callout-danger', role: 'alert' }, errorText(e, 'errors.BACKUP_DAMAGED'), ' ', t('exim.backup.untouched')));
    }
  });

  function showRestore(backup) {
    const source = eximSource();
    const counts = backup.counts || {};
    // On a new device there is no company yet: the backup creates it.
    const canRestore = Boolean(source.store) && !source.store.readOnly && !source.demo;
    const keep = h('input', { type: 'checkbox', id: 'exim-restore-keep', checked: Boolean(source.company) });
    const restoreButton = h('button', { type: 'button', class: 'btn btn-danger', id: 'exim-restore-apply', disabled: !canRestore }, t('exim.backup.restore'));
    restoreButton.addEventListener('click', async () => {
      const ok = await confirmIrreversible({
        title: t('exim.backup.restoreTitle'), message: t('exim.backup.restoreText', { name: backup.companyName || '' }), okLabel: t('exim.backup.restore'),
        consequences: [t('exim.backup.consequence1'), t('exim.backup.consequence2'), t('exim.backup.consequence3')]
      });
      if (!ok) return;
      try {
        restoreButton.disabled = true;
        const current = eximSource();
        if (keep.checked && current.company) await downloadBackup(current, null, deps.transport);
        if (!current.store.data) await createCompanyFor(current.store, backup);
        const now = new Date().toISOString();
        const plan = planRestore(current.store.data, backup, { now, schemaVersion: SCHEMA_VERSION });
        await replaceCompanyData(current.store, withAudit(current.store.data, plan.data, { now, reason: 'restore' }));
        clear(restoreInfo);
        showToast(t('exim.backup.restored', { restored: plan.restored, removed: plan.removed }), { type: 'success' });
      } catch (e) {
        showError(e, 'errors.BACKUP_FAILED');
        restoreButton.disabled = false;
      }
    });
    restoreInfo.append(h('div', { class: 'callout' },
      h('p', {}, h('strong', {}, backup.companyName || ''), ` (${formatDateTime(backup.createdAt)})`),
      h('p', { class: 'small' }, t('exim.backup.contents', { documents: counts.documents || 0, contacts: counts.contacts || 0, items: counts.items || 0 })),
      !canRestore ? h('p', { class: 'small' }, t(source.demo ? 'exim.demoReadOnly' : 'exim.backup.readOnly')) : null,
      canRestore && !source.company ? h('p', { class: 'small' }, t('exim.backup.newCompany')) : null,
      h('label', { for: 'exim-restore-keep', class: 'checkbox-label' }, keep, h('span', {}, t('exim.backup.keepCurrent'))),
      h('div', { class: 'exim-actions' }, restoreButton)));
  }

  panel.append(
    h('section', { class: 'card exim-card' },
      h('h2', {}, t('exim.backup.title')),
      h('p', { class: 'muted' }, t('exim.backup.text')),
      !canBackup ? h('p', { class: 'callout' }, t(source0.demo ? 'exim.demoReadOnly' : 'exim.noCompany')) : null,
      h('div', { class: 'exim-grid' },
        h('div', { class: 'field' }, h('label', { for: 'exim-backup-password' }, t('exim.backup.password')), password, h('div', { class: 'field-hint' }, t('exim.backup.passwordHint', { n: MIN_PASSWORD }))),
        h('div', { class: 'field' }, h('label', { for: 'exim-backup-repeat' }, t('exim.backup.repeat')), repeat)),
      h('div', { class: 'exim-actions' }, saveButton)),
    h('section', { class: 'card exim-card' },
      h('h2', {}, t('exim.backup.restoreHeading')),
      h('p', { class: 'muted' }, t('exim.backup.restoreIntro')),
      h('div', { class: 'exim-actions' }, openButton), restoreInfo));
}
