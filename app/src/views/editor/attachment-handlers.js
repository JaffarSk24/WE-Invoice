// What the attachment buttons do, for the editor and the card alike: the
// write guard (demo mode, read-only data), storing the files, the toasts.
// prepare() returns the id of the stored document; the editor uses it to
// store a new draft first, the card already has one.
import { t } from '../../i18n/index.js';
import { showToast, showError } from '../../ui/toast.js';
import { salesStore, guardWrite } from '../documents/source.js';
import { addAttachments, removeAttachment } from './attachments.js';

/**
 * @param {{prepare: () => Promise<string>|string, after?: Function}} ctx
 *   after(doc) runs with the stored document once the attachments changed
 */
export function attachmentHandlers({ prepare, after = () => {} }) {
  return {
    async onAdd(files) {
      if (!guardWrite()) return;
      try {
        const id = await prepare();
        const store = salesStore();
        const records = await addAttachments(store, id, files);
        showToast(t('documents.attachments.added', { n: records.length }), { type: 'success' });
        after(store.get('documents', id));
      } catch (e) {
        showError(e);
      }
    },
    async onRemove(record) {
      if (!guardWrite()) return;
      try {
        const id = await prepare();
        const store = salesStore();
        await removeAttachment(store, id, record.id);
        showToast(t('documents.attachments.removed', { name: record.name }), { type: 'success' });
        after(store.get('documents', id));
      } catch (e) {
        showError(e);
      }
    }
  };
}
