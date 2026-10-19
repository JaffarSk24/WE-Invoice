// The document editor shared by every sales kind (03-features.md § 3.6.2):
// client, head, lines, advances, payment and print settings, totals and
// the live PDF beside them from 1280 px (a toggle below). A draft saves
// itself a moment after the last change; "Vystaviť" checks the particulars
// and issues it. Issued documents open here only while canEdit allows.
import '../../style/editor.css';
import { h, icon, clear, append } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { todayLocal } from '../../components/dates.js';
import { emptyState } from '../../components/empty-state.js';
import { statusBadge } from '../../components/status-badge.js';
import { previewNumber, resolveSeries, takenNumbers } from '../documents/series.js';
import { salesHash, routeForKind } from '../documents/kinds.js';
import { salesStore, companyNow, allDocuments, allContacts, allItems, allPriceLevels } from '../documents/source.js';
import { newDraft, applyContact, withIssueDate, liveTotals, isPayer } from './draft.js';
import { relabelUnits, unitLabel } from './units.js';
import { partyField } from './party-field.js';
import { headerForm } from './header-form.js';
import { paymentForm } from './payment-form.js';
import { createLinesForm } from './lines-form.js';
import { advancesPanel } from './advances.js';
import { createTotalsPanel } from './totals-panel.js';
import { createPdfPreview, previewDocument } from './preview.js';
import { clientPrice, searchItems } from './pricing.js';
import { editorActions } from './editor-actions.js';
import { attachmentsPanel } from './attachments-panel.js';
import { attachmentHandlers } from './attachment-handlers.js';

const SAVE_DELAY_MS = 1200;

function contactOf(id) {
  return id ? allContacts().find(c => c.id === id) || null : null;
}

function initialDraft({ kind, params, doc, company }) {
  if (doc) return structuredClone(doc);
  const contact = contactOf(params.contact);
  return newDraft({ kind, company, contact, today: todayLocal(), unitLabel: unitLabel('C62', (contact && contact.language) || (company.defaults && company.defaults.language) || 'sk') });
}

/**
 * @param {HTMLElement} root
 * @param {{route: string, kind: string, doc?: object|null, params?: object, transport?: object}} input
 */
export function renderEditor(root, { route, kind, doc = null, params = {}, transport = null }) {
  const company = companyNow();
  if (!company) {
    root.append(emptyState({ title: t('documents.empty.noCompany.title'), text: t('documents.empty.noCompany.text'), iconName: 'building-2' }));
    return () => {};
  }
  const state = { draft: initialDraft({ kind, params, doc, company }), stored: Boolean(doc), timer: null, saving: null, missing: [] };
  const preview = createPdfPreview();
  const totalsPanel = createTotalsPanel({ payer: isPayer(company) });
  const missingBox = h('div', { class: 'editor-missing-box' });
  const form = h('div', { class: 'editor-form' });
  const layout = h('div', { class: 'editor-layout' }, form, preview.el);
  let lines = null;
  let head = null;
  let party = null;
  let payment = null;

  const documents = () => allDocuments();
  const contact = () => contactOf(state.draft.contactId);
  const numberPreview = () => {
    const { series } = resolveSeries(companyNow() || company, state.draft.kind, state.draft.seriesId);
    return previewNumber(series, state.draft.issueDate || todayLocal(), takenNumbers(documents(), series.id));
  };

  const refresh = () => {
    const { totals, error } = liveTotals(state.draft, company);
    totalsPanel.show(totals, error, state.draft.currency || 'EUR');
    if (lines) lines.showTotals(totals, state.draft.currency || 'EUR');
    if (head) head.refreshNumber(state.draft);
    preview.update(previewDocument(state.draft, { company, totals, number: numberPreview() }), company, documents());
  };

  const save = async () => {
    clearTimeout(state.timer);
    const store = salesStore();
    if (!store || store.readOnly || state.draft.status !== 'DRAFT') return null;
    const run = (state.saving || Promise.resolve()).then(() => actions.persist(store));
    state.saving = run.catch(() => {});
    return run;
  };
  const scheduleSave = () => {
    clearTimeout(state.timer);
    state.timer = setTimeout(() => { save().catch(e => console.error('Draft could not be saved', e)); }, SAVE_DELAY_MS);
  };

  const onDraft = (patch, opts = {}) => {
    state.draft = { ...state.draft, ...patch };
    if (opts.redraw === 'all') drawForm();
    else if (opts.redraw) lines.draw(state.draft);
    else if (lines) lines.setDraft(state.draft);
    refresh();
    scheduleSave();
  };

  const onContact = (id) => {
    const picked = contactOf(id);
    if (!picked) return;
    state.draft = { ...applyContact(state.draft, picked, company) };
    state.draft.lines = relabelUnits(state.draft.lines, state.draft.language);
    drawForm();
    refresh();
    scheduleSave();
  };

  const actions = editorActions({
    route, state, company, save,
    showMissing: (missing) => showMissing(missing),
    onContactCreated: onContact
  });

  function showMissing(missing) {
    state.missing = missing;
    clear(missingBox);
    const callout = actions.missingCallout(missing);
    if (callout) { missingBox.append(callout); refreshIcons(missingBox); }
    const at = (field) => missing.find(m => m.field === field);
    Object.entries({ ...head.errors, ...payment.errors }).forEach(([field, set]) => {
      const hit = at(field);
      set(hit ? t(`document.missing.${hit.code}`) : null);
    });
    const buyer = missing.find(m => m.field.startsWith('buyer.'));
    party.setError(buyer ? t(`document.missing.${buyer.code}`) : null);
    lines.showErrors(missing);
    if (missing.length) missingBox.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  // The document is stored before its first file, so the files always
  // belong to a stored record; the panel alone is redrawn afterwards.
  const attachBox = h('div', { class: 'editor-attachments' });
  const attachments = attachmentHandlers({
    prepare: async () => {
      const store = salesStore();
      if (state.draft.status === 'DRAFT') { clearTimeout(state.timer); await actions.persist(store, { force: true }); }
      return state.draft.id;
    },
    after: (doc) => { if (doc) { state.draft = { ...state.draft, attachments: doc.attachments || [] }; drawAttachments(); } }
  });
  function drawAttachments() {
    clear(attachBox);
    append(attachBox, [attachmentsPanel({ doc: state.draft, ...attachments })]);
    refreshIcons(attachBox);
  }

  function drawForm() {
    clear(form);
    const ctx = { draft: state.draft, company, documents: documents(), transport, onDraft };
    party = partyField({
      contacts: allContacts, contact: contact(), buyer: state.draft.buyer, readOnly: false,
      onPick: onContact, onCreate: actions.createContact
    });
    head = headerForm({ ...ctx, onIssueDate: (date) => { state.draft = withIssueDate(state.draft, date, contact(), company); drawForm(); refresh(); scheduleSave(); } });
    payment = paymentForm({
      ...ctx,
      onLanguage: (language) => onDraft({ language, lines: relabelUnits(state.draft.lines, language), secondLanguage: state.draft.secondLanguage === language ? null : state.draft.secondLanguage }, { redraw: 'all' })
    });
    lines = createLinesForm({
      draft: state.draft, company, onDraft,
      items: (q) => searchItems(allItems(), q),
      itemById: (id) => allItems().find(i => i.id === id) || null,
      itemPrice: (item, qty) => clientPrice(item, { contact: contact(), date: state.draft.issueDate, qty, priceLevels: allPriceLevels() })
    });
    append(form, [party.el, head.el, lines.el, advancesPanel(ctx), payment.el, attachBox, totalsPanel.el]);
    drawAttachments();
    refreshIcons(form);
    if (state.missing.length) showMissing(state.missing);
  }

  const title = state.draft.number
    ? `${t(`document.kind.${state.draft.kind}`)} ${state.draft.number}`
    : t(`documents.new.${state.draft.kind}`);
  const toggle = h('button', {
    type: 'button', class: 'btn btn-ghost editor-preview-toggle', 'aria-pressed': 'false',
    onclick: () => { const on = layout.classList.toggle('show-preview'); toggle.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  }, icon('eye'), t('documents.editor.previewToggle'));

  root.append(
    h('header', { class: 'view-header editor-header' },
      h('div', { class: 'editor-title' },
        h('a', { href: salesHash(route || routeForKind(state.draft.kind)), class: 'btn btn-ghost btn-icon', 'aria-label': t('documents.editor.back') }, icon('arrow-left')),
        h('h1', {}, title), statusBadge(state.draft.status || 'DRAFT')),
      h('div', { class: 'view-actions' }, toggle, actions.buttons())),
    missingBox, layout);
  drawForm();
  refresh();
  refreshIcons(root);
  return () => { save().catch(e => console.error('Draft could not be saved', e)); preview.destroy(); };
}
