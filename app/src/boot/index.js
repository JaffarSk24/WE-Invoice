// The modules started at launch, in order. Each work package edits only
// its own boot/<module>.js; this list is a contract (WP-0).
//
// ctx = { registerRoute(name, render), transport, t, showToast, showError,
//         navigate, on(event, fn), emit(event, payload) }
// A module that fails to start is reported and the others still start.
import * as sync from './sync.js';
import * as ui from './ui.js';
import * as pdf from './pdf.js';
import * as desktop from './desktop.js';
import * as sales from './sales.js';
import * as peppol from './peppol.js';
import * as bank from './bank.js';
import * as purchase from './purchase.js';
import * as exim from './exim.js';
import * as tax from './tax.js';
import * as ledger from './ledger.js';
import * as stock from './stock.js';
import * as reports from './reports.js';
import * as ekasa from './ekasa.js';

export const MODULES = Object.freeze([
  ['sync', sync], ['ui', ui], ['pdf', pdf], ['desktop', desktop], ['sales', sales], ['peppol', peppol],
  ['bank', bank], ['purchase', purchase], ['exim', exim], ['tax', tax], ['ledger', ledger], ['stock', stock],
  ['reports', reports], ['ekasa', ekasa]
]);

export async function bootModules(ctx, onError) {
  for (const [name, mod] of MODULES) {
    try {
      await mod.boot(ctx);
    } catch (e) {
      onError(name, e);
    }
  }
}
