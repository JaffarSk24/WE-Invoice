// The Inbox screen (03-features.md § 3.11): files come in by drag and
// drop, paste, the file picker or the phone camera, each is read and
// recognised, and waits in the queue ("Na spracovanie") until the user
// checks it. Clicking a row opens the review.
import { h, icon, clear } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { on } from '../../events.js';
import { showToast, showError } from '../../ui/toast.js';
import { navigate } from '../../router.js';
import { createTable } from '../../components/table.js';
import { emptyState } from '../../components/empty-state.js';
import { todayLocal } from '../../components/dates.js';
import { isDemo } from '../shell/demo-mode.js';
import { createDropZone } from './drop-zone.js';
import { inboxColumns } from './columns.js';
import { listRows, canWrite, storeOrNull, RECEIVED_KINDS, EXPENSE_KINDS } from './data.js';
import { intakeFile } from './intake.js';
import { docHash } from './routes.js';

function progressRow(file) {
  const bar = h('progress', { max: '100', value: '0', 'aria-label': file.name });
  const stage = h('span', { class: 'muted' }, t('purchase.progress.reading'));
  const el = h('li', { class: 'inbox-progress-item' }, icon('hourglass'), h('span', { class: 'inbox-progress-name' }, file.name), stage, bar);
  return {
    el,
    update(name, fraction) {
      stage.textContent = t(`purchase.progress.${name}`);
      bar.value = String(Math.round(Math.max(0, Math.min(1, fraction)) * 100));
    }
  };
}

export async function handleFiles(files, { transport, progressList }) {
  if (isDemo() || !canWrite()) {
    showToast(t(isDemo() ? 'purchase.demo.readOnly' : 'purchase.noCompany'), { type: 'info' });
    return [];
  }
  const store = storeOrNull();
  const created = [];
  for (const file of files) {
    const row = progressRow(file);
    progressList.append(row.el);
    refreshIcons(row.el);
    try {
      const { doc, warnings } = await intakeFile(file, {
        store, transport, today: todayLocal(), lineName: t('purchase.line.default'), onProgress: (stage, f) => row.update(stage, f)
      });
      created.push(doc);
      if (warnings.length) showToast(t('purchase.inbox.ekasaFailed'), { type: 'info' });
    } catch (e) {
      showError(e, 'errors.INBOX_READ_FAILED');
    } finally {
      row.el.remove();
    }
  }
  if (created.length === 1) navigate(docHash('inbox', created[0].id));
  else if (created.length > 1) showToast(t('purchase.inbox.added', { n: created.length }), { type: 'success' });
  return created;
}

export function renderInbox(root, ctx) {
  const progressList = h('ul', { class: 'inbox-progress', 'aria-live': 'polite' });
  const drop = createDropZone({ onFiles: (files) => handleFiles(files, { transport: ctx.transport, progressList }) });
  const listBox = h('div', { class: 'inbox-queue' });
  root.append(
    h('header', { class: 'view-header' },
      h('div', {}, h('h1', {}, t('nav.inbox')), h('p', { class: 'muted view-subtitle' }, t('purchase.inbox.subtitle')))),
    drop, progressList, listBox);

  const table = createTable({
    key: 'purchase-inbox', columns: inboxColumns(), rows: [],
    onRowClick: (row) => navigate(docHash('inbox', row.id)),
    empty: emptyState({ title: t('purchase.inbox.empty.title'), text: t('purchase.inbox.empty.text'), iconName: 'inbox' })
  });
  listBox.append(h('h2', { class: 'section-title' }, t('purchase.inbox.queue')), table.el);
  const refresh = () => table.setRows(listRows([...RECEIVED_KINDS, ...EXPENSE_KINDS], { inbox: true }));
  refresh();
  refreshIcons(root);
  const off = on('data:changed', ({ collection } = {}) => {
    if (!root.isConnected) { off(); return; }
    if (collection === 'documents' || collection === 'company') refresh();
  });
  return { refresh, clearList: () => clear(listBox) };
}
