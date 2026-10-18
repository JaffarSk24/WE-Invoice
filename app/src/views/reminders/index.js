// The reminders screen (Upomienky, #/reminders): what goes out today by
// the company policy (reminders before and after the due date, thank-you
// notes), every overdue invoice by client with the printed reminder, and
// the journal of reminders sent. Each send opens the e-mail window with
// the template of the level and the interest filled in; "send all" uses
// the SMTP account of the desktop app.
import '../../style/contacts.css';
import '../../style/recurring.css';
import { h, icon } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { emit } from '../../events.js';
import { formatDate, formatDateTime, todayLocal } from '../../components/dates.js';
import { formatAmount } from '../../components/decimal.js';
import { emptyState } from '../../components/empty-state.js';
import { smtpAccount } from '../../mail/deliver.js';
import { listOf, companyOf, canWrite, onData } from '../contacts/source.js';
import { effectivePolicy, remindersDue, thankYouDue } from './plan.js';
import { penaltiesOf } from './runner.js';
import { overdueBlock } from './overdue.js';
import { runDueReminders } from './service.js';

const LOGGED = /^(REMINDER_[0-3]|THANK_YOU)$/;

function dueRow(entry, { policy, company, today, readOnly }) {
  const d = entry.document;
  const penalties = penaltiesOf(entry, { policy, company, today });
  return h('div', { class: 'reminder-row', dataset: { doc: d.id, purpose: entry.purpose } },
    h('div', { class: 'reminder-main' },
      h('span', {}, h('strong', {}, entry.contact?.name || d.buyer?.name || ''), ' · ', t(`crm.kind.${d.kind}`), ' ', d.number || ''),
      h('span', { class: 'reminder-meta' }, h('span', { class: 'reminder-level' }, t(`mail.purpose.${entry.purpose}`)), ' · ',
        entry.purpose === 'THANK_YOU' ? '' : t('reminders.dueOn', { date: formatDate(d.dueDate), days: entry.days }))),
    entry.amountDue ? h('strong', { class: 'num' }, formatAmount(entry.amountDue, d.currency || 'EUR')) : null,
    h('div', { class: 'reminder-actions' },
      h('button', { type: 'button', class: 'btn btn-primary btn-sm reminder-send', disabled: readOnly, onclick: () => emit('document:send', { documentId: d.id, purpose: entry.purpose, penalties }) }, icon('send'), t('reminders.send'))));
}

function journal(documents) {
  const rows = documents.flatMap(d => (d.sendLog || []).filter(e => LOGGED.test(e.detail || '')).map(e => ({ e, d })))
    .sort((a, b) => String(b.e.at).localeCompare(String(a.e.at))).slice(0, 50);
  if (!rows.length) return h('p', { class: 'muted' }, t('reminders.journal.none'));
  return h('ul', { class: 'reminder-log', id: 'reminder-log' }, rows.map(({ e, d }) => h('li', {},
    h('span', { class: 'muted' }, formatDateTime(e.at)), ' ', t(`mail.purpose.${e.detail}`), ': ', d.number || '', ' ', e.to || '', ' ',
    h('span', { class: 'badge' }, t(`mail.result.${e.result}`)))));
}

export function createRemindersView({ transport }) {
  return (root) => {
    const body = h('div', {});
    const smtp = smtpAccount();
    const sendAll = h('button', { type: 'button', class: 'btn', id: 'reminders-send-all', hidden: !smtp, onclick: () => runDueReminders({ transport, force: true }) }, icon('send'), t('reminders.sendAll'));
    root.append(
      h('header', { class: 'view-header' }, h('h1', {}, t('nav.reminders')),
        h('div', { class: 'view-actions' }, sendAll, h('a', { class: 'btn', href: '#/settings/reminders' }, icon('settings'), t('reminders.settings')))),
      body);
    const draw = () => {
      const today = todayLocal();
      const documents = listOf('documents');
      const contacts = listOf('contacts');
      const company = companyOf();
      const policy = effectivePolicy(listOf('reminderPolicies'));
      const readOnly = !canWrite();
      const input = { documents, contacts, policy, today };
      const due = [...remindersDue(input), ...thankYouDue(input)];
      body.replaceChildren(
        !policy.enabled ? h('p', { class: 'callout callout-warning' }, icon('info'), h('span', {}, t('reminders.disabled'))) : null,
        policy.enabled && policy.lateInterest && !policy.ecbRatePct ? h('p', { class: 'callout callout-warning', id: 'reminders-ecb-missing' }, icon('info'), h('span', {}, t('reminders.ecbMissing'))) : null,
        h('section', { class: 'card reminder-group', id: 'reminders-today' }, h('h2', {}, t('reminders.today')),
          due.length ? due.map(e => dueRow(e, { policy, company, today, readOnly })) : emptyState({ title: t('reminders.today.none'), iconName: 'circle-check' })),
        h('h2', { class: 'settings-subtitle' }, t('reminders.overdue.title')),
        overdueBlock({ documents, contacts, policy, company, today, transport, readOnly }),
        h('section', { class: 'card reminder-group reminder-journal' }, h('h2', {}, t('reminders.journal.title')), journal(documents)));
      refreshIcons(root);
    };
    draw();
    onData(root, ['documents', 'contacts', 'reminderPolicies'], draw);
  };
}
