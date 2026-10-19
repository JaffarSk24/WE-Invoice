// The tax screens (WP-TAX): routes vat-records, vat-return, kv and sv.
// Each route keeps its period (remembered per company on the device) and
// the state of its report (kind of filing, VIES results) while the app
// runs, and draws itself again when the data or the company changes.
import '../../style/tax.css';
import { clear } from '../../ui/dom.js';
import { on } from '../../events.js';
import { renderVatRecords } from './records-view.js';
import { renderReport } from './report-view.js';
import { KV_REPORT, SV_REPORT, VAT_RETURN_REPORT } from './previews.js';
import { taxSource, defaultPeriod, rememberPeriod } from './data.js';

const REDRAW_ON = ['data:changed', 'company:switched', 'demo:enabled', 'demo:disabled'];

// Listeners are added once per route, never from inside an event: a
// listener added while an event is delivered would get it again.
function route(ctx, draw) {
  const state = {};
  let current = null;
  let subscribed = false;
  let paint = () => {};
  const render = (root) => {
    const company = taxSource().company;
    const key = company ? company.id : '';
    if (!state[key]) state[key] = { report: {} };
    const own = state[key];
    if (!own.period) own.period = defaultPeriod(company);
    current = root;
    paint = () => {
      clear(root);
      draw(root, ctx, {
        period: own.period,
        state: own.report,
        onPeriod: (period) => {
          own.period = period;
          own.report = {};
          rememberPeriod(company, period);
          paint();
        }
      });
    };
    paint();
    if (subscribed) return;
    subscribed = true;
    REDRAW_ON.forEach(ev => on(ev, (payload) => {
      if (!current || !current.isConnected) return;
      // A sync of another collection does not change the reports.
      if (ev === 'data:changed' && payload && !['documents', 'company', 'auditLog'].includes(payload.collection)) return;
      // Another company (or the sample data) starts again from its own period.
      if (ev === 'data:changed') paint(); else render(current);
    }));
  };
  return render;
}

const ROUTES = Object.freeze({
  'vat-records': renderVatRecords,
  kv: (root, c, view) => renderReport(root, c, KV_REPORT, view),
  sv: (root, c, view) => renderReport(root, c, SV_REPORT, view),
  'vat-return': (root, c, view) => renderReport(root, c, VAT_RETURN_REPORT, view)
});
export const TAX_ROUTES = Object.freeze(Object.keys(ROUTES));

// One renderer per boot context and route, so the state of a route lives
// as long as the app.
const renderers = new WeakMap();

/** Draws a tax route; the boot file loads this module on first use. */
export function renderTaxRoute(name, ctx, root) {
  if (!renderers.has(ctx)) renderers.set(ctx, new Map());
  const own = renderers.get(ctx);
  if (!own.has(name)) own.set(name, route(ctx, ROUTES[name]));
  own.get(name)(root);
}

export function registerTaxRoutes(ctx) {
  TAX_ROUTES.forEach(name => ctx.registerRoute(name, (root) => renderTaxRoute(name, ctx, root)));
}
