// The card of one contact: identifiers with the VAT light and the date of
// the last check, addresses, e-mails and contact persons, the client's
// own terms, the balance, all documents of the client and the history of
// e-mails sent to them. "Nová faktúra" asks the sales package for a new
// invoice for this client (event document:new).
import { h, icon, append } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { emit } from '../../events.js';
import { createTabs } from '../../components/tabs.js';
import { statusBadge } from '../../components/status-badge.js';
import { formatDate, formatDateTime, todayLocal } from '../../components/dates.js';
import { formatAmount } from '../../components/decimal.js';
import { emptyState } from '../../components/empty-state.js';
import { confirmDialog } from '../../ui/modal.js';
import { showToast } from '../../ui/toast.js';
import { languageInfo } from '../../i18n/languages.js';
import { contactDocuments, contactBalance, documentAmounts, anonymizePatch } from './model.js';
import { runAllChecks } from './checks.js';
import { vatBadge, peppolBadge, balanceText } from './badges.js';
import { getOf, listOf, write, onData, go } from './source.js';

const dl = (pairs) => h('dl', { class: 'contact-facts' }, pairs.filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));

function overview(contact, documents) {
  const a = contact.billingAddress || {};
  const balance = contactBalance(contact, documents, todayLocal());
  const terms = [
    [t('contacts.field.dueDays'), contact.dueDays ?? t('contacts.asCompany')],
    [t('contacts.field.discountPct'), contact.discountPct ? `${contact.discountPct} %` : null],
    [t('contacts.field.currency'), contact.currency || t('contacts.asCompany')],
    [t('contacts.field.language'), contact.language ? languageInfo(contact.language).name : t('contacts.asCompany')],
    [t('contacts.field.sendReminders'), contact.sendReminders === false ? t('contacts.no') : t('contacts.yes')]
  ];
  return h('div', { class: 'contact-overview' },
    h('section', { class: 'card' }, h('h2', {}, t('contacts.section.balance')), dl([
      [t('contacts.balance.turnover'), balanceText(balance.byCurrency, 'turnover')],
      [t('contacts.balance.due'), balanceText(balance.byCurrency, 'due')],
      [t('contacts.balance.overdue'), String(balance.overdue)]
    ])),
    h('section', { class: 'card' }, h('h2', {}, t('contacts.section.ids')), dl([
      [t('contacts.field.ico'), contact.ico], [t('contacts.field.dic'), contact.dic], [t('contacts.field.icDph'), contact.icDph],
      [t('contacts.field.address'), [a.street, [a.zip, a.city].filter(Boolean).join(' '), a.country].filter(Boolean).join(', ')],
      [t('contacts.field.phone'), contact.phone], [t('contacts.field.iban'), contact.iban]
    ])),
    h('section', { class: 'card' }, h('h2', {}, t('contacts.section.emails')),
      (contact.emails || []).length || (contact.persons || []).length
        ? h('ul', { class: 'contact-list' },
          (contact.emails || []).map(e => h('li', {}, h('a', { href: `mailto:${e.address}` }, e.address), ' ', (e.purposes || []).map(p => h('span', { class: 'badge' }, t(`contacts.purpose.${p}`))))),
          (contact.persons || []).map(p => h('li', {}, h('strong', {}, p.name), p.role ? ` (${p.role})` : '', p.email ? ` ${p.email}` : '', p.phone ? ` ${p.phone}` : '')))
        : h('p', { class: 'muted' }, t('contacts.emails.none'))),
    // Terms and the note span the whole row under the three cards above:
    // the terms side by side, each label over its value.
    h('section', { class: 'card contact-wide' }, h('h2', {}, t('contacts.section.terms')),
      h('dl', { class: 'contact-terms' }, terms.filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v))))),
    contact.note ? h('section', { class: 'card contact-wide' }, h('h2', {}, t('contacts.field.note')), h('p', { class: 'pre-line' }, contact.note)) : null);
}

function documentList(contact, documents) {
  const docs = contactDocuments(contact, documents);
  if (!docs.length) return emptyState({ title: t('contacts.documents.none'), iconName: 'file-text' });
  return h('table', { class: 'table contact-docs' },
    h('thead', {}, h('tr', {}, ['docKind', 'number', 'issueDate', 'dueDate', 'status', 'amount', 'due'].map(k => h('th', { scope: 'col', class: k === 'amount' || k === 'due' ? 'num' : null }, t(`contacts.documents.${k}`))), h('th', { scope: 'col', class: 'col-actions' }))),
    h('tbody', {}, docs.map(d => {
      const { gross, due } = documentAmounts(d);
      return h('tr', {},
        h('td', {}, t(`crm.kind.${d.kind}`)), h('td', {}, d.number || t('status.DRAFT')), h('td', {}, formatDate(d.issueDate)), h('td', {}, formatDate(d.dueDate)),
        h('td', {}, statusBadge(d.status)), h('td', { class: 'num' }, formatAmount(gross, d.currency || 'EUR')), h('td', { class: 'num' }, formatAmount(due, d.currency || 'EUR')),
        h('td', {}, d.status === 'DRAFT' ? null : h('button', {
          type: 'button', class: 'btn btn-ghost btn-sm doc-send', dataset: { doc: d.id }, onclick: () => emit('document:send', { documentId: d.id })
        }, icon('send'), t('reminders.send'))));
    })));
}

function mailHistory(contact, documents) {
  const rows = contactDocuments(contact, documents).flatMap(d => (d.sendLog || []).map(e => ({ ...e, doc: d })))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  if (!rows.length) return emptyState({ title: t('contacts.history.none'), iconName: 'mail' });
  return h('ul', { class: 'contact-list' }, rows.map(r => h('li', {},
    h('span', { class: 'muted' }, formatDateTime(r.at)), ' ', t(`crm.kind.${r.doc.kind}`), ' ', r.doc.number || '', ': ',
    t(`mail.log.${r.channel}`), r.to ? ` ${r.to}` : '', ' ', h('span', { class: 'badge' }, t(`mail.result.${r.result}`)),
    r.detail ? h('span', { class: 'muted small' }, ` ${t(`mail.purpose.${r.detail}`)}`) : null)));
}

export function renderContactDetail(root, id, { transport }) {
  function draw() {
    root.replaceChildren();
    const contact = getOf('contacts', id);
    if (!contact) {
      root.append(emptyState({ title: t('contacts.notFound'), iconName: 'users', actionLabel: t('contacts.back'), onAction: () => go('contacts'), actionIcon: 'arrow-left' }));
      refreshIcons(root);
      return;
    }
    const documents = listOf('documents');
    const checkVat = async () => {
      if (!contact.icDph && !contact.dic) { showToast(t('contacts.vat.noNumber')); return; }
      await write(async (store) => {
        const patch = await runAllChecks(transport, contact);
        await store.update('contacts', contact.id, patch);
        const status = patch.vatReliability.status;
        if (contact.icDph) showToast(t(`contacts.vat.result.${status}`), { type: status === 'RED' ? 'error' : 'success' });
        if (patch.peppolCapable) showToast(t(patch.peppolCapable.value ? 'contacts.peppol.yes' : 'contacts.peppol.no'));
      });
    };
    const remove = async () => {
      if (!(await confirmDialog(t('contacts.deleteConfirm', { name: contact.name }), { danger: true, okLabel: t('common.delete') }))) return;
      const done = await write(store => store.remove('contacts', contact.id));
      if (done) go('contacts');
    };
    const anonymize = async () => {
      if (!(await confirmDialog(t('contacts.anonymizeConfirm'), { danger: true, okLabel: t('contacts.anonymize') }))) return;
      if (await write(store => store.update('contacts', contact.id, anonymizePatch(contact)))) showToast(t('contacts.anonymized'));
    };
    const canAnonymize = contact.kind === 'PERSON' && !contact.anonymizedAt;
    append(root, [
      h('header', { class: 'view-header' },
        h('div', {},
          h('a', { href: '#/contacts', class: 'back-link' }, icon('arrow-left'), t('contacts.back')),
          h('h1', { id: 'contact-title' }, contact.anonymizedAt ? t('contacts.anonymizedName') : contact.name),
          h('div', { class: 'contact-badges' }, t(`contacts.kind.${contact.kind || 'COMPANY'}`), ' ', vatBadge(contact, { withDate: true }), ' ', peppolBadge(contact))),
        h('div', { class: 'view-actions' },
          h('button', { type: 'button', class: 'btn', onclick: checkVat, id: 'contact-check-vat' }, icon('shield-check'), t('contacts.vat.checkBoth')),
          h('button', { type: 'button', class: 'btn', onclick: () => go(`contacts/${encodeURIComponent(contact.id)}/edit`), id: 'contact-edit' }, icon('pencil-line'), t('contacts.edit')),
          canAnonymize ? h('button', { type: 'button', class: 'btn btn-ghost', onclick: anonymize, id: 'contact-anonymize' }, icon('shield-check'), t('contacts.anonymize')) : null,
          h('button', { type: 'button', class: 'btn btn-ghost', onclick: remove, id: 'contact-delete' }, icon('x'), t('common.delete')),
          h('button', { type: 'button', class: 'btn btn-primary', id: 'contact-new-invoice', onclick: () => emit('document:new', { kind: 'INVOICE', contactId: contact.id }) }, icon('file-plus-2'), t('contacts.newInvoice')))),
      createTabs({
        tabs: [
          { id: 'overview', label: t('contacts.tab.overview'), render: (p) => p.append(overview(contact, documents)) },
          { id: 'documents', label: t('contacts.tab.documents'), render: (p) => p.append(documentList(contact, documents)) },
          { id: 'history', label: t('contacts.tab.history'), render: (p) => p.append(mailHistory(contact, documents)) }
        ]
      }).el]);
    refreshIcons(root);
  }
  draw();
  onData(root, ['contacts', 'documents'], draw);
}
