// Start-up of the ledger module (WP-LEDGER): registers its routes over the
// placeholders and starts its services. Called once, in the order of
// boot/index.js, after the language and the transport are ready.
//   cash-journal  peňažný denník, books, trips (or the flat-rate records)
//   assets        kniha majetku and depreciation
//   closing       year-end closing and statements
// The screens load on first use, so they do not weigh on the start; the
// automatic entries follow the payments on documents in the background.
import '../style/ledger.css';
import { setLedgerTransport } from '../views/ledger/export.js';
import { startAutoEntries } from '../views/ledger/auto-entries.js';

const SCREENS = {
  'cash-journal': () => import('../views/ledger/journal-view.js').then(m => m.renderCashJournal),
  assets: () => import('../views/ledger/assets-view.js').then(m => m.renderAssets),
  closing: () => import('../views/ledger/closing-view.js').then(m => m.renderClosing)
};

export async function boot(ctx) {
  setLedgerTransport(ctx.transport);
  Object.entries(SCREENS).forEach(([route, load]) => {
    ctx.registerRoute(route, (root, name) => {
      load().then(render => { if (root.isConnected) render(root, name); }).catch(e => ctx.showError(e));
    });
  });
  startAutoEntries({ on: ctx.on, onError: (e) => ctx.showError(e, 'ledger.auto.error') });
}
