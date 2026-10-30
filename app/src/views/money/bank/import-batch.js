// Several bank statements at once: every file is read on its own and goes
// to the account with its IBAN (else the chosen or default one), one row
// per file says what was found, and one button stores the new movements of
// all of them. A movement in two files (overlapping statements) is stored
// once. A file that cannot be read, or a CSV whose columns need choosing
// by hand, is left out with a note: imported alone it opens the full view.
// PDF statements share one password prompt (pdf-statement.js).
import { h } from '../../../ui/dom.js';
import { openModal } from '../../../ui/modal.js';
import { t } from '../../../i18n/index.js';
import { showToast } from '../../../ui/toast.js';
import { parseBankStatement, parsePdfStatementText, withImportKeys, splitDuplicates, uuidv7 } from '@we-invoice/core';
import { isPdf, statementPdfReader } from './pdf-statement.js';
import { moneyState } from '../shared/data.js';
import { guarded } from '../shared/write.js';
import { openMatchDialog } from './match-dialog.js';
import { pickAccount, readFile } from './import-dialog.js';

/** What every file holds: { name, format, account, fresh, duplicates, problem }. */
export async function readBatch(files, { accounts, existing, accountId = '', readPdfText = null }) {
  const seen = [...existing];
  const out = [];
  for (const file of files) {
    const name = file.name || '';
    let result;
    try {
      const bytes = await readFile(file);
      result = isPdf(bytes) ? parsePdfStatementText(await readPdfText(bytes, name)) : parseBankStatement(bytes, {});
    } catch (e) {
      out.push({ name, problem: t(e?.code ? `errors.${e.code}` : 'errors.UNKNOWN'), fresh: [], duplicates: [] });
      continue;
    }
    if (result.warnings.includes('BANK_CSV_COLUMNS_MISSING')) {
      out.push({ name, format: result.format, problem: t('bank.import.batch.columns'), fresh: [], duplicates: [] });
      continue;
    }
    const account = pickAccount(accounts, result.account?.iban, accountId);
    if (!account) { out.push({ name, format: result.format, problem: t('bank.noAccounts'), fresh: [], duplicates: [] }); continue; }
    const split = splitDuplicates(withImportKeys(account.id, result.transactions), seen);
    seen.push(...split.fresh);
    const mismatch = result.account?.iban && !accounts.some(a => a.iban === result.account.iban);
    out.push({ name, format: result.format, account, fresh: split.fresh, duplicates: split.duplicates,
      problem: mismatch ? t('bank.import.accountMismatch', { iban: result.account.iban }) : null });
  }
  return out;
}

/** Stores the new movements of every file, each file with its own import id; returns their ids. */
export async function storeBatch(store, rows) {
  const ids = [];
  for (const row of rows) {
    if (!row.fresh.length) continue;
    const importId = uuidv7();
    for (const tx of row.fresh) {
      const { line, ...record } = tx;
      void line;
      ids.push((await store.insert('bankTransactions', { ...record, importId, matched: null })).id);
    }
  }
  return ids;
}

export async function openBatchDialog(ctx, files, { accountId = '' } = {}) {
  const state = moneyState();
  // One reader for the whole batch: the PDF password is asked once at most.
  let reader = null;
  const readPdfText = async (bytes, name) => { reader = reader || await statementPdfReader(ctx, state.company.id); return reader(bytes, name); };
  const rows = await readBatch(files, { accounts: state.company.bankAccounts || [], existing: state.bankTransactions, accountId, readPdfText });
  const total = rows.reduce((n, r) => n + r.fresh.length, 0);
  const table = h('table', { class: 'table preview-table batch-table' },
    h('thead', {}, h('tr', {}, [t('bank.import.batch.file'), t('bank.import.account'), t('bank.import.batch.fresh'), t('bank.import.batch.duplicates')]
      .map((c, i) => h('th', { class: i > 1 ? 'num' : null }, c)))),
    h('tbody', {}, rows.map(r => h('tr', {},
      h('td', {}, h('div', {}, r.name), r.format ? h('div', { class: 'muted small' }, r.format) : null, r.problem ? h('div', { class: 'field-error' }, r.problem) : null),
      h('td', {}, r.account ? [r.account.name, r.account.iban].filter(Boolean).join(' ') : ''),
      h('td', { class: 'num' }, String(r.fresh.length)),
      h('td', { class: 'num' }, String(r.duplicates.length))))));
  openModal({
    title: t('bank.import.title'), wide: true,
    body: h('div', { class: 'import-body' }, h('p', {}, t('bank.import.batch.summary', { files: rows.length, fresh: total })), table),
    actions: [
      { label: t('common.cancel'), onClick: (m) => m.close() },
      {
        label: t('bank.import.confirm', { n: total }), kind: 'primary',
        onClick: async (m) => {
          if (!total) { showToast(t('bank.import.nothing'), { type: 'info' }); return; }
          m.close();
          const ids = await guarded(store => storeBatch(store, rows));
          if (!ids) return;
          showToast(t('bank.import.done', { n: ids.length }), { type: 'success' });
          openMatchDialog(ctx, ids);
        }
      }
    ]
  });
}
