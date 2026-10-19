// The Reports screen (03-features.md § 3.12): a period bar, then tabs for
// sales, purchases, receivables and payables by age, the cash flow
// forecast and profitability, each with a chart or summary, tables, CSV
// export and printing. The screen redraws when the data changes; the
// numbers come from the pure report functions of the core.
import { h, icon, clear, append } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { on } from '../../events.js';
import { navigate } from '../../router.js';
import { collectLabels, collectProjects } from '@we-invoice/core';
import { createTabs } from '../../components/tabs.js';
import { emptyState } from '../../components/empty-state.js';
import { reportData } from './data.js';
import { createPeriodBar, loadPeriod, resolvePeriod } from './period.js';
import { printReport } from './export.js';
import { renderSalesPanel } from './tab-sales.js';
import { renderAgingPanel, renderCashflowPanel } from './tab-money.js';
import { renderProfitPanel } from './tab-profit.js';
import '../../style/reports.css';

export const REPORT_TABS = Object.freeze(['sales', 'purchases', 'aging', 'cashflow', 'profit']);

function panelRenderer(id) {
  if (id === 'sales' || id === 'purchases') return (panel, state) => renderSalesPanel(panel, { ...state, direction: id });
  if (id === 'aging') return renderAgingPanel;
  if (id === 'cashflow') return renderCashflowPanel;
  return renderProfitPanel;
}

function safely(panel, render, state) {
  try {
    render(panel, state);
  } catch (e) {
    console.error('A report could not be drawn', e);
    append(panel, [h('p', { class: 'muted' }, t(e && e.code ? `errors.${e.code}` : 'errors.UNKNOWN'))]);
  }
  refreshIcons(panel);
}

let offs = [];
let activeTab = 'sales';

export function renderReports(root) {
  offs.forEach(off => off());
  offs = [];
  const view = h('div', { class: 'reports-view' });
  const body = h('div', { class: 'reports-body' });
  let period = resolvePeriod(loadPeriod());

  const draw = () => {
    clear(body);
    const data = reportData();
    if (!data.ready) {
      body.append(emptyState({ title: t('reports.noCompany.title'), text: t('reports.noCompany.text'), iconName: 'chart-column', actionLabel: t('reports.noCompany.action'), onAction: () => navigate('onboarding') }));
      refreshIcons(body);
      return;
    }
    const bar = createPeriodBar({ value: loadPeriod(), labels: collectLabels(data.documents), projects: collectProjects(data.documents), onChange: (next) => { period = next; draw(); } });
    const state = { data, period };
    const tabs = createTabs({
      tabs: REPORT_TABS.map(id => ({ id, label: t(`reports.tab.${id}`), render: (panel) => safely(panel, panelRenderer(id), state) })),
      active: activeTab,
      onChange: (id) => { activeTab = id; },
      cls: 'report-tabs'
    });
    body.append(bar.el, tabs.el);
    refreshIcons(body);
  };

  append(view, [
    h('header', { class: 'view-header' },
      h('h1', {}, t('nav.reports')),
      h('div', { class: 'view-actions' },
        reportData().demo ? h('span', { class: 'badge badge-demo' }, t('reports.demoBadge')) : null,
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => navigate('trash') }, icon('archive'), t('reports.trash.title')),
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => navigate('audit') }, icon('notebook-pen'), t('reports.audit.title')),
        h('button', { type: 'button', class: 'btn', onclick: printReport }, icon('file-text'), t('reports.print')))),
    body]);
  root.append(view);
  draw();
  refreshIcons(view);
  let pending = null;
  const redraw = () => {
    if (!body.isConnected) return;
    clearTimeout(pending);
    pending = setTimeout(draw, 150);
  };
  ['data:changed', 'company:switched', 'demo:enabled', 'demo:disabled'].forEach(ev => offs.push(on(ev, (payload) => {
    if (payload && payload.collection === 'auditLog') return;
    redraw();
  })));
}
