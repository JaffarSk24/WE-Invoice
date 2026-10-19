// The action bar of the editor and what its buttons do: save, issue
// ("Vystaviť" with the particulars check), delete a draft with Undo,
// download the PDF of an issued document, create a contact on the spot.
// A draft is stored only once it has content, then its address becomes
// the edit address of the stored document.
import { computeTotals } from '@we-invoice/core';
import { h, icon } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { emit } from '../../events.js';
import { showToast, showError } from '../../ui/toast.js';
import { showUndoToast } from '../../components/undo-toast.js';
import { salesHash, routeForKind } from '../documents/kinds.js';
import { salesStore, guardWrite, allDocuments } from '../documents/source.js';
import { markPending, clearPending } from '../documents/pending.js';
import { downloadPdf } from '../documents/bulk.js';
import { saveDocument, issueDraft, deleteDraft } from './actions.js';
import { missingCallout } from './missing.js';

/** True when a draft holds anything worth storing. */
export function hasContent(draft) {
  if (draft.contactId || (draft.buyer && draft.buyer.name)) return true;
  return (draft.lines || []).some(l => (l.name && l.name.trim()) || (l.unitPrice && Number(l.unitPrice) !== 0));
}

export function editorActions({ route, state, company, save, showMissing, onContactCreated }) {
  const listRoute = () => route || routeForKind(state.draft.kind);

  async function persist(store, { force = false } = {}) {
    if (state.closed) return null;
    if (!state.stored && !force && !hasContent(state.draft)) return null;
    // Never write a draft over a document that was issued meanwhile (on
    // another screen or device): the issued one wins.
    const current = store.get('documents', state.draft.id);
    if (current && current.status !== 'DRAFT') return current;
    const stored = await saveDocument(store, state.draft);
    if (!state.stored) {
      state.stored = true;
      try { window.history.replaceState(null, '', salesHash(listRoute(), { id: stored.id, mode: 'edit' })); } catch (e) { console.warn('Address could not be updated', e); }
    }
    return stored;
  }

  async function saveNow() {
    if (!guardWrite()) return;
    const store = salesStore();
    try {
      if (state.draft.status === 'DRAFT') {
        clearTimeout(state.timer);
        await persist(store, { force: true });
      } else {
        await saveDocument(store, { ...state.draft, totals: computeTotals(state.draft) });
      }
      showToast(t('documents.toast.saved'), { type: 'success' });
    } catch (e) {
      showError(e);
    }
  }

  async function issue() {
    if (!guardWrite()) return;
    try {
      await save();
      const doc = await issueDraft(salesStore(), state.draft);
      state.draft = doc;
      state.closed = true;
      showMissing([]);
      showToast(t('documents.toast.issued', { number: doc.number }), { type: 'success' });
      window.location.hash = salesHash(listRoute(), { id: doc.id });
    } catch (e) {
      if (e && e.code === 'DOCUMENT_INCOMPLETE' && e.details && e.details.missing) {
        console.warn('Document is incomplete', e.details.missing);
        showMissing(e.details.missing);
        showToast(t('errors.DOCUMENT_INCOMPLETE'), { type: 'error' });
      } else {
        showError(e);
      }
    }
  }

  function remove() {
    const id = state.draft.id;
    clearTimeout(state.timer);
    if (!state.stored) { state.closed = true; window.location.hash = salesHash(listRoute()); return; }
    if (!guardWrite()) return;
    state.closed = true;
    markPending(id);
    window.location.hash = salesHash(listRoute());
    showUndoToast(t('documents.toast.deleted'), {
      commit: () => deleteDraft(salesStore(), id).catch(e => showError(e)).finally(() => clearPending(id)),
      revert: () => { clearPending(id); emit('data:changed', { collection: 'documents', id, source: 'local' }); }
    });
  }

  async function createContact(record) {
    if (!guardWrite()) return;
    const contact = await salesStore().insert('contacts', record);
    showToast(t('documents.toast.contactCreated', { name: contact.name }), { type: 'success' });
    onContactCreated(contact.id);
  }

  function buttons() {
    const draft = state.draft.status === 'DRAFT';
    return [
      h('button', { type: 'button', class: 'btn', id: 'editor-save', onclick: saveNow }, icon('check'), t('common.save')),
      draft ? h('button', { type: 'button', class: 'btn btn-brand', id: 'editor-issue', onclick: issue }, icon('file-check'), t('documents.action.issue')) : null,
      !draft ? h('button', { type: 'button', class: 'btn', onclick: () => downloadPdf(state.draft, { company, documents: allDocuments() }) }, icon('download'), t('documents.action.pdf')) : null,
      draft ? h('button', { type: 'button', class: 'btn btn-ghost', id: 'editor-delete', onclick: remove }, icon('trash-2'), t('documents.action.deleteDraft')) : null,
      !draft ? h('a', { class: 'btn btn-ghost', href: salesHash(listRoute(), { id: state.draft.id }) }, icon('x'), t('documents.action.closeEdit')) : null
    ];
  }

  return { persist, buttons, createContact, missingCallout, issue };
}
