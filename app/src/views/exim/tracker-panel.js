// WE Time Tracker (03-features.md § 3.15): the JSON a user saves in Time
// Tracker becomes the lines of a draft invoice. A client, a period, unpaid
// only, grouped by project, task or day; the preview shows the lines and
// the sum before anything is written. The status file lists the entries
// that went on the invoice, for Time Tracker to mark them invoiced.
import { h, clear, selectEl, append } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { showToast, showError } from '../../ui/toast.js';
import { navigate } from '../../router.js';
import { formatAmount } from '../../components/decimal.js';
import { formatDate, todayLocal } from '../../components/dates.js';
import { importTimeTracker, readTimeTracker, timeTrackerClients, timeTrackerStatus, vatRatesOn } from './core-bridge.js';
import { companySnapshot, contactSnapshot, mul, div, round } from '@we-invoice/core';
import { eximSource } from './source.js';
import { pickFiles, saveFile } from './files.js';
import { periodPicker } from './period-picker.js';
import { errorText } from './labels.js';

function lineName(group) {
  if (group.groupBy === 'day') return t('exim.tracker.lineDay', { date: formatDate(group.key) });
  const name = group.groupBy === 'project' ? group.projectName || group.description : group.description;
  return name || t('exim.tracker.lineWork');
}

export function standardRate(company, today = todayLocal()) {
  if (!company || company.vatMode !== 'PAYER') return null;
  const found = vatRatesOn(today).find(r => r.code === 'STANDARD');
  return found ? found.rate : null;
}

/** A draft invoice for a contact with the tracked lines. */
export function draftInvoice(company, contact, lines, today = todayLocal()) {
  return {
    kind: 'INVOICE', status: 'DRAFT', number: null, issueDate: today, taxDate: today, currency: (contact && contact.currency) || 'EUR',
    seller: companySnapshot(company), buyer: contact ? contactSnapshot(contact) : { name: '', address: {} }, contactId: contact ? contact.id : null,
    lines: lines.map(({ sourceLogIds, ...line }) => line), payments: [], links: [], paymentMethod: 'TRANSFER', tags: [], sendLog: [], attachments: []
  };
}

export function renderTrackerPanel(panel, deps = {}) {
  const state = { source: null, clientId: null, groupBy: 'project', unpaidOnly: true, preset: 'lastMonth', from: null, to: null, result: null };
  const area = h('div', { class: 'exim-tracker', 'aria-live': 'polite' });
  const picker = periodPicker(state, () => update(), 'exim-tracker');

  function update() {
    clear(area);
    if (!state.source) return;
    const source = eximSource();
    const range = picker.value();
    try {
      state.result = importTimeTracker(state.source, {
        clientId: state.clientId, from: range.from, to: range.to, unpaidOnly: state.unpaidOnly, groupBy: state.groupBy,
        vatRate: standardRate(source.company), label: lineName
      });
    } catch (e) {
      area.append(h('p', { class: 'callout callout-danger', role: 'alert' }, errorText(e, 'errors.IMPORT_FAILED')));
      return;
    }
    const r = state.result;
    const contacts = source.contacts;
    const contact = selectEl([{ value: '', label: t('exim.tracker.noContact') }, ...contacts.map(c => ({ value: c.id, label: c.name }))], '', { id: 'exim-tracker-contact' });
    const create = h('button', { type: 'button', class: 'btn btn-primary', id: 'exim-tracker-create', disabled: !r.lines.length || !source.writable }, t('exim.tracker.create'));
    create.addEventListener('click', async () => {
      try {
        const chosen = contacts.find(c => c.id === contact.value) || null;
        const doc = await source.store.insert('documents', draftInvoice(source.company, chosen, r.lines));
        showToast(t('exim.tracker.created', { n: r.lines.length }), { type: 'success' });
        navigate(`invoices/${doc.id}/edit`);
      } catch (e) {
        showError(e, 'errors.IMPORT_FAILED');
      }
    });
    const status = h('button', { type: 'button', class: 'btn', id: 'exim-tracker-status', disabled: !r.logIds.length }, t('exim.tracker.statusFile'));
    status.addEventListener('click', () => saveFile('we-time-tracker-invoiced.json', JSON.stringify(timeTrackerStatus({ logIds: r.logIds, invoicedAt: new Date().toISOString() }), null, 1), 'application/json', deps.transport).catch(e => showError(e)));
    append(area, [
      r.lines.length ? h('div', { class: 'exim-table-wrap' }, h('table', { class: 'exim-table', id: 'exim-tracker-lines' },
        h('thead', {}, h('tr', {}, [t('exim.lineColumn.name'), t('exim.lineColumn.qty'), t('exim.lineColumn.unitPrice'), t('exim.lineColumn.net')].map(x => h('th', { scope: 'col' }, x)))),
        h('tbody', {}, r.lines.map(l => h('tr', {}, h('td', {}, l.name), h('td', { class: 'num' }, l.qty), h('td', { class: 'num' }, formatAmount(l.unitPrice)), h('td', { class: 'num' }, formatAmount(round(mul(l.qty, l.unitPrice), 2)))))))) : h('p', { class: 'muted' }, t('exim.tracker.none')),
      h('p', {}, t('exim.tracker.total', { hours: round(div(String(r.minutes), '60'), 2), amount: formatAmount(r.amount) })),
      source.demo ? h('p', { class: 'callout' }, t('exim.demoReadOnly')) : null,
      h('div', { class: 'field' }, h('label', { for: 'exim-tracker-contact' }, t('exim.tracker.contact')), contact),
      h('div', { class: 'exim-actions' }, create, status)]);
  }

  const clientSelect = h('div', { class: 'field', id: 'exim-tracker-client-field' });
  const choose = h('button', { type: 'button', class: 'btn', id: 'exim-tracker-choose' }, t('exim.tracker.choose'));
  choose.addEventListener('click', async () => {
    try {
      const [file] = await pickFiles({ accept: '.json,application/json' }, deps.transport);
      if (!file) return;
      state.source = readTimeTracker(await file.text());
      const clients = timeTrackerClients(state.source);
      state.clientId = clients.length ? clients[0].id : null;
      const select = selectEl(clients.map(c => ({ value: c.id || '', label: `${c.name || c.id || t('exim.tracker.noClient')} (${c.count})` })), state.clientId || '', { id: 'exim-tracker-client' });
      select.addEventListener('change', () => { state.clientId = select.value || null; update(); });
      clientSelect.replaceChildren(h('label', { for: 'exim-tracker-client' }, t('exim.tracker.client')), select);
      update();
    } catch (e) {
      showError(e, 'errors.IMPORT_FAILED');
    }
  });
  const groupBy = selectEl(['project', 'task', 'day'].map(g => ({ value: g, label: t(`exim.tracker.group.${g}`) })), state.groupBy, { id: 'exim-tracker-group' });
  groupBy.addEventListener('change', () => { state.groupBy = groupBy.value; update(); });
  const unpaid = h('input', { type: 'checkbox', id: 'exim-tracker-unpaid', checked: true });
  unpaid.addEventListener('change', () => { state.unpaidOnly = unpaid.checked; update(); });

  panel.append(h('section', { class: 'card exim-card' },
    h('h2', {}, t('exim.tracker.title')),
    h('p', { class: 'muted' }, t('exim.tracker.text')),
    h('div', { class: 'exim-actions' }, choose),
    clientSelect, picker.el,
    h('div', { class: 'field' }, h('label', { for: 'exim-tracker-group' }, t('exim.tracker.groupBy')), groupBy),
    h('label', { for: 'exim-tracker-unpaid', class: 'checkbox-label' }, unpaid, h('span', {}, t('exim.tracker.unpaid'))),
    area));
}
