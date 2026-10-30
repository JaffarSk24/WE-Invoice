// Czech interface texts, one part per work package so parallel work
// never edits the same file. A key lives in exactly one part.
import common from './common.js';
import core from './core.js';
import sync from './sync.js';
import ui from './ui.js';
import pdf from './pdf.js';
import desktop from './desktop.js';
import net from './net.js';
import sales from './sales.js';
import peppol from './peppol.js';
import bank from './bank.js';
import bankFiles from './bank-files.js';
import purchase from './purchase.js';
import exim from './exim.js';
import tax from './tax.js';
import ledger from './ledger.js';
import stock from './stock.js';
import reports from './reports.js';
import ekasa from './ekasa.js';

export const parts = { common, core, sync, ui, pdf, desktop, net, sales, peppol, bank, bankFiles, purchase, exim, tax, ledger, stock, reports, ekasa };
export const cs = Object.assign({}, common, core, sync, ui, pdf, desktop, net, sales, peppol, bank, bankFiles, purchase, exim, tax, ledger, stock, reports, ekasa);
