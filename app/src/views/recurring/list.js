// The list of recurring invoices: client, how often, the next run, draft
// or issued, automatic e-mail, how many were made, pause and resume, and
// "run now" for the due ones. Drafts made by the schedule wait in the
// invoice list of the sales package.
import { h, icon } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { createTable } from '../../components/table.js';
import { emptyState } from '../../components/empty-state.js';
import { formatDate } from '../../components/dates.js';
import { showToast } from '../../ui/toast.js';
import { listOf, getOf, onData, write, go } from '../contacts/source.js';
import { runDueRecurring } from './service.js';

export function frequencyLabel(tpl) {
  if (tpl.frequency === 'MONTHS') return t('recurring.frequency.everyMonths', { n: tpl.interval || 1 });
  if (tpl.frequency === 'WEEK' && (tpl.interval || 1) > 1) return t('recurring.frequency.everyWeeks', { n: tpl.interval });
  return t(`recurring.frequency.${tpl.frequency}`);
}

function stateLabel(tpl) {
  if (tpl.active !== false) return h('span', { class: 'badge tpl-active' }, icon('repeat'), t('recurring.state.active'));
  return h('span', { class: 'badge tpl-paused' }, icon('circle'), t(tpl.finished ? 'recurring.state.finished' : 'recurring.state.paused'));
}

async function toggle(tpl) {
  const done = await write(store => store.update('recurringTemplates', tpl.id, { active: tpl.active === false }));
  if (done) showToast(t(tpl.active === false ? 'recurring.resumed' : 'recurring.paused'));
}

function columns() {
  return [
    { id: 'name', label: t('recurring.field.name'), always: true, sortValue: (x) => x.name, render: (x) => x.name || getOf('contacts', x.docTemplate?.contactId)?.name || '' },
    { id: 'contact', label: t('recurring.field.contact'), render: (x) => getOf('contacts', x.docTemplate?.contactId)?.name || '' },
    { id: 'frequency', label: t('recurring.field.frequency'), render: frequencyLabel },
    { id: 'next', label: t('recurring.field.nextRun'), primary: true, sortValue: (x) => x.nextRun || '', render: (x) => (x.active === false ? '' : formatDate(x.nextRun)) },
    { id: 'mode', label: t('recurring.field.issueMode'), render: (x) => t(`recurring.issueMode.${x.issueMode === 'ISSUE' ? 'ISSUE' : 'DRAFT'}`) + (x.autoSend ? `, ${t('recurring.autoSend.short')}` : '') },
    { id: 'count', label: t('recurring.field.count'), align: 'num', render: (x) => String(x.generatedCount || 0) },
    { id: 'state', label: t('recurring.field.state'), cardHidden: true, render: (x) => h('span', { class: 'tpl-state' }, stateLabel(x), ' ', h('button', {
      type: 'button', class: 'btn btn-ghost btn-sm', onclick: (e) => { e.stopPropagation(); toggle(x); }
    }, t(x.active === false ? 'recurring.resume' : 'recurring.pause'))) }
  ];
}

export function renderTemplateList(root, { transport }) {
  const body = h('div', {});
  root.append(
    h('header', { class: 'view-header' }, h('h1', {}, t('nav.recurring')),
      h('div', { class: 'view-actions' },
        h('button', { type: 'button', class: 'btn', id: 'recurring-run', onclick: async () => {
          const result = await runDueRecurring({ transport });
          if (result && !result.created.length) showToast(t('recurring.run.nothing'));
        } }, icon('refresh-cw'), t('recurring.runNow')),
        h('button', { type: 'button', class: 'btn btn-primary', id: 'recurring-new', onclick: () => go('recurring/new') }, icon('plus'), t('recurring.new')))),
    h('p', { class: 'muted recurring-intro' }, t('recurring.intro')),
    body);
  const draw = () => {
    const all = listOf('recurringTemplates');
    if (!all.length) {
      body.replaceChildren(emptyState({ title: t('recurring.empty.title'), text: t('recurring.empty.text'), iconName: 'repeat', actionLabel: t('recurring.new'), onAction: () => go('recurring/new') }));
    } else {
      body.replaceChildren(createTable({ key: 'recurring', columns: columns(), rows: all, onRowClick: (x) => go(`recurring/${encodeURIComponent(x.id)}`) }).el);
    }
    refreshIcons(root);
  };
  draw();
  onData(root, ['recurringTemplates', 'contacts'], draw);
}
