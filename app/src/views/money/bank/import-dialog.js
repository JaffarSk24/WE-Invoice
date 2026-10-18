// Importing a bank statement: the user picks a file, sees what was read
// (format, bank profile, account, how many movements are new and how many
// were imported before, a preview) and may switch the CSV profile or
// assign columns by hand. Only new movements are stored, so importing the
// same statement twice changes nothing; the new ones go to matching.
import { h, clear } from '../../../ui/dom.js';
import { openModal } from '../../../ui/modal.js';
import { t } from '../../../i18n/index.js';
import { showToast, showError } from '../../../ui/toast.js';
import { parseBankStatement, withImportKeys, splitDuplicates, BANK_PROFILES, uuidv7 } from '@we-invoice/core';
import { moneyState } from '../shared/data.js';
import { canWrite, guarded } from '../shared/write.js';
import { day, money } from '../shared/format.js';
import { openMatchDialog } from './match-dialog.js';

const ACCEPT = '.csv,.txt,.xml,.sta,.mt940,.940,.gpc,.abo';
const MAPPED = ['date', 'amount', 'debit', 'credit', 'currency', 'counterpartyName', 'counterpartyAccount', 'vs', 'message', 'ref'];
const PREVIEW_ROWS = 8;

async function readFile(file) {
  if (file && typeof file.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer());
  if (file && file.data) return file.data;
  return file;
}

/** The account a statement belongs to: the one with its IBAN, else the preferred or default one. */
export function pickAccount(accounts, statementIban, preferredId) {
  return accounts.find(a => statementIban && a.iban === statementIban)
    || accounts.find(a => a.id === preferredId)
    || accounts.find(a => a.isDefault) || accounts[0] || null;
}

function mappingEditor(result, options, rerender) {
  if (result.format !== 'CSV' || !result.header?.length) return null;
  const choices = [{ value: '', label: t('bank.import.column.auto') }, ...result.header.map((name, i) => ({ value: String(i), label: name || `#${i + 1}` }))];
  const rows = MAPPED.map(field => {
    const current = options.mapping[field] ?? '';
    const select = h('select', {
      'aria-label': t(`bank.import.column.${field}`),
      onchange: (e) => {
        if (e.target.value === '') delete options.mapping[field]; else options.mapping[field] = Number(e.target.value);
        rerender();
      }
    }, choices.map(c => h('option', { value: c.value, selected: String(current) === c.value }, c.label)));
    return h('label', { class: 'mapping-row' }, h('span', {}, t(`bank.import.column.${field}`)), select);
  });
  return h('details', { class: 'mapping-editor', open: result.warnings.includes('BANK_CSV_COLUMNS_MISSING') },
    h('summary', {}, t('bank.import.columns')), h('div', { class: 'mapping-grid' }, rows));
}

function preview(list) {
  if (!list.length) return null;
  return h('table', { class: 'table preview-table' },
    h('thead', {}, h('tr', {}, [t('bank.col.date'), t('bank.col.counterparty'), t('bank.col.vs'), t('bank.col.amount')].map((c, i) => h('th', { class: i === 3 ? 'num' : null }, c)))),
    h('tbody', {}, list.slice(0, PREVIEW_ROWS).map(tx => h('tr', {},
      h('td', {}, day(tx.date)), h('td', {}, tx.counterpartyName || tx.message || ''), h('td', {}, tx.vs || ''), h('td', { class: 'num' }, money(tx.amount, tx.currency))))));
}

export async function openImportDialog(ctx, { accountId = '' } = {}) {
  const state = moneyState();
  if (!canWrite(state)) return;
  let bytes;
  let fileName = '';
  try {
    const file = await ctx.transport.files.openFile({ accept: ACCEPT });
    if (!file) return;
    fileName = file.name || '';
    bytes = await readFile(file);
  } catch (e) {
    showError(e);
    return;
  }
  const accounts = state.company.bankAccounts || [];
  const options = { profile: null, mapping: {}, accountId: null };
  const body = h('div', { class: 'import-body' });
  let fresh = [];
  let confirm = null;

  const render = () => {
    clear(body);
    let result;
    try {
      result = parseBankStatement(bytes, { profile: options.profile || undefined, mapping: options.mapping });
    } catch (e) {
      showError(e);
      body.append(h('p', { class: 'field-error' }, t(e?.code ? `errors.${e.code}` : 'errors.UNKNOWN')));
      fresh = [];
      if (confirm) confirm.disabled = true;
      return;
    }
    const account = pickAccount(accounts, result.account?.iban, options.accountId || accountId);
    options.accountId = account ? account.id : null;
    const keyed = account ? withImportKeys(account.id, result.transactions) : [];
    const split = splitDuplicates(keyed, moneyState().bankTransactions);
    fresh = split.fresh;
    body.append(
      h('p', { class: 'muted' }, t('bank.import.file', { name: fileName }), ' ', t('bank.import.format', { format: result.format })),
      result.format === 'CSV' ? h('label', { class: 'field' }, h('span', {}, t('bank.import.profile')), h('select', {
        onchange: (e) => { options.profile = e.target.value; options.mapping = {}; render(); }
      }, [{ id: 'generic', name: t('bank.import.profile.generic') }, ...BANK_PROFILES].map(p => h('option', { value: p.id, selected: p.id === result.profile }, p.name)))) : null,
      accounts.length ? h('label', { class: 'field' }, h('span', {}, t('bank.import.account')), h('select', {
        onchange: (e) => { options.accountId = e.target.value; render(); }
      }, accounts.map(a => h('option', { value: a.id, selected: account && a.id === account.id }, [a.name, a.iban].filter(Boolean).join(' '))))) : h('p', { class: 'callout callout-warning' }, t('bank.noAccounts')),
      result.account?.iban && !accounts.some(a => a.iban === result.account.iban) ? h('p', { class: 'callout callout-warning' }, t('bank.import.accountMismatch', { iban: result.account.iban })) : null,
      mappingEditor(result, options, render),
      result.warnings.map(w => h('p', { class: 'callout callout-warning' }, t(`bank.import.warning.${w}`, { n: w === 'BANK_ROWS_PENDING' ? result.pending : result.invalid }))),
      h('p', {}, t('bank.import.summary', { total: keyed.length, fresh: split.fresh.length, duplicates: split.duplicates.length })),
      result.openingBalance && result.closingBalance ? h('p', { class: 'muted' }, t('bank.import.balances', {
        opening: money(result.openingBalance.amount, result.account?.currency), closing: money(result.closingBalance.amount, result.account?.currency)
      })) : null,
      preview(split.fresh)
    );
    if (confirm) {
      confirm.disabled = !fresh.length;
      confirm.textContent = t('bank.import.confirm', { n: fresh.length });
    }
  };

  const modal = openModal({
    title: t('bank.import.title'), wide: true, body: h('div', {}, h('p', { class: 'field-hint' }, t('bank.import.hint')), body),
    actions: [
      { label: t('common.cancel'), onClick: (m) => m.close() },
      { label: t('bank.import.confirm', { n: 0 }), kind: 'primary', onClick: (m) => store(m) }
    ]
  });
  confirm = modal.footer.querySelector('[data-primary]');
  render();

  async function store(m) {
    if (!fresh.length) { showToast(t('bank.import.nothing'), { type: 'info' }); return; }
    confirm.disabled = true;
    const importId = uuidv7();
    const ids = await guarded(async (s) => {
      const out = [];
      for (const tx of fresh) {
        const { line, ...record } = tx;
        void line;
        const saved = await s.insert('bankTransactions', { ...record, importId, matched: null });
        out.push(saved.id);
      }
      return out;
    });
    m.close();
    if (!ids) return;
    showToast(t('bank.import.done', { n: ids.length }), { type: 'success' });
    openMatchDialog(ctx, ids);
  }
}
