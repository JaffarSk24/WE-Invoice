// The attachments of a document on screen, the same in the editor and on
// the card: the list with name and size, opening a file, removing one
// (confirmed and logged once the document is issued) and adding files
// with a file picker that takes several at once; each file says where it
// is (on this device, in Google Drive, on its way). The caller passes the
// document and what to do; this module only draws and asks.
import { h, icon, append } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { formatNumber } from '../../components/decimal.js';
import { confirmDialog } from '../../ui/modal.js';
import { showToast, showError } from '../../ui/toast.js';
import { openBlob } from '../documents/pdf-frame.js';
import { MAX_ATTACHMENT_BYTES, attachmentBlob, removalNeedsConfirmation } from './attachments.js';
import { attachmentBadge } from '../../sync/ui/attachment-badge.js';
import { attachmentMissingKey } from '../../sync/attachments/registry.js';

const KB = 1024;
const MB = 1024 * 1024;

/** Size of a file for people: kB below one megabyte, else MB with one decimal. */
export function sizeText(bytes) {
  const n = Number(bytes) || 0;
  if (n < MB) return t('documents.attachments.size.kb', { size: formatNumber(String(Math.max(1, Math.round(n / KB))), undefined, { maximumFractionDigits: 0 }) });
  return t('documents.attachments.size.mb', { size: formatNumber((n / MB).toFixed(1), undefined, { maximumFractionDigits: 1 }) });
}

export async function openAttachment(record, deps) {
  try {
    const blob = await attachmentBlob(record, deps);
    if (!blob) { showToast(t(attachmentMissingKey(record.id), { name: record.name }), { type: 'error' }); return false; }
    openBlob(blob, record.name);
    return true;
  } catch (e) {
    showError(e);
    return false;
  }
}

/**
 * @param {{doc: object, readOnly?: boolean, onAdd: (files: File[]) => Promise<void>, onRemove: (record: object) => Promise<void>}} ctx
 */
export function attachmentsPanel(ctx) {
  const { doc, readOnly = false } = ctx;
  const records = doc.attachments || [];
  const input = h('input', { type: 'file', multiple: true, class: 'visually-hidden', id: `attach-${doc.id}`, 'aria-label': t('documents.attachments.add') });
  input.addEventListener('change', async () => {
    const files = Array.from(input.files || []);
    input.value = '';
    if (files.length) await ctx.onAdd(files);
  });
  const remove = async (record) => {
    if (removalNeedsConfirmation(doc) && !(await confirmDialog(t('documents.attachments.removeConfirm', { name: record.name }), { danger: true, okLabel: t('documents.attachments.remove') }))) return;
    await ctx.onRemove(record);
  };
  const rows = records.map(record => h('li', { class: 'attachment-row', dataset: { attachmentId: record.id } },
    icon('file-text'),
    h('span', { class: 'attachment-name' }, record.name),
    h('span', { class: 'muted small' }, sizeText(record.size)),
    attachmentBadge(record),
    h('span', { class: 'attachment-tools' },
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm attachment-open', onclick: () => openAttachment(record) }, icon('eye'), t('documents.attachments.open')),
      readOnly ? null : h('button', {
        type: 'button', class: 'btn btn-ghost btn-icon btn-sm attachment-remove', 'aria-label': t('documents.attachments.remove'), title: t('documents.attachments.remove'), onclick: () => remove(record)
      }, icon('trash-2')))));
  const list = h('ul', { class: 'attachment-list' });
  append(list, rows.length ? rows : [h('li', { class: 'muted' }, t('documents.attachments.none'))]);
  return h('section', { class: 'card doc-attachments', 'aria-labelledby': `attachments-title-${doc.id}` },
    h('h2', { id: `attachments-title-${doc.id}` }, t('documents.attachments.title')),
    list,
    readOnly ? null : h('div', { class: 'attachment-add' },
      h('label', { for: `attach-${doc.id}`, class: 'btn', id: 'attachment-add' }, icon('plus'), t('documents.attachments.add')), input,
      h('span', { class: 'muted small' }, t('documents.attachments.hint', { max: sizeText(MAX_ATTACHMENT_BYTES) }))));
}
