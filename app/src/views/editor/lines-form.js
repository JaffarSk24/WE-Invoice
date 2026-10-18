// The lines of the editor: the list of rows, adding an item, a text line
// or a subtotal, moving rows by drag and drop (and by buttons, for the
// keyboard), the price entry mode (without or with VAT) and the document
// discount. After every change the parent recomputes the totals and this
// module writes the line totals and subtotals into their cells.
import { add } from '@we-invoice/core';
import { h, icon, selectEl } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { formatAmount, parseDecimal, toInputText } from '../../components/decimal.js';
import { emptyLine, insertLine, removeLine, moveLine, duplicateLine, updateLine, withVatChoice, lineFromItem, isPayer } from './draft.js';
import { unitLabel } from './units.js';
import { lineRow } from './line-row.js';

function discountField(draft, onDraft) {
  const d = draft.docDiscount || {};
  const mode = selectEl([{ value: 'pct', label: t('documents.editor.discount.pct') }, { value: 'amount', label: t('documents.editor.discount.amount') }], d.amount ? 'amount' : 'pct', { 'aria-label': t('documents.editor.discount.mode') });
  const value = h('input', { type: 'text', inputmode: 'decimal', class: 'num', value: toInputText(d.amount || d.pct || null), 'aria-label': t('documents.editor.discount.value') });
  const reason = h('input', { type: 'text', value: d.reason || '', placeholder: t('documents.editor.discount.reason'), 'aria-label': t('documents.editor.discount.reason') });
  const error = h('span', { class: 'line-error', role: 'alert', hidden: true });
  const save = () => {
    const raw = value.value.trim();
    if (!raw) { error.hidden = true; onDraft({ docDiscount: null }); return; }
    const parsed = parseDecimal(raw);
    if (parsed === null) { error.textContent = t('documents.editor.invalidNumber'); error.hidden = false; return; }
    error.hidden = true;
    onDraft({ docDiscount: mode.value === 'amount' ? { pct: null, amount: parsed, reason: reason.value || null } : { pct: parsed, amount: null, reason: reason.value || null } });
  };
  [mode, value, reason].forEach(el => el.addEventListener('change', save));
  return h('div', { class: 'doc-discount' }, h('span', { class: 'line-label' }, t('documents.editor.discount.title')), mode, value, reason, error);
}

/**
 * @param {{draft: object, company: object, items: Function, itemById: Function, itemPrice: Function, onDraft: Function}} ctx
 *   items(query) -> suggestions; itemPrice(item) -> price for the client; onDraft(patch, {redraw}) applies a change
 */
export function createLinesForm(ctx) {
  const el = h('section', { class: 'editor-lines card', 'aria-labelledby': 'editor-lines-title' });
  const list = h('div', { class: 'lines-list' });
  const refs = new Map();
  let draft = ctx.draft;

  const setLines = (lines, redraw = true) => ctx.onDraft({ lines }, { redraw });
  const date = () => draft.taxDate || draft.issueDate;
  const lineCtx = () => ({
    company: ctx.company, date: date(), language: draft.language || 'sk', payer: isPayer(ctx.company),
    grossPrices: draft.lines.some(l => l.priceType === 'GROSS'),
    searchItems: ctx.items,
    registerLine: (id, ref) => refs.set(id, ref),
    onChange: (id, patch) => { draft = { ...draft, lines: updateLine(draft.lines, id, patch) }; setLines(draft.lines, false); },
    onVat: (id, value) => setLines(draft.lines.map(l => (l.id === id ? withVatChoice(l, value, date()) : l))),
    onPickItem: (id, itemId) => {
      const item = ctx.itemById(itemId);
      if (!item) return;
      const line = draft.lines.find(l => l.id === id);
      const filledLine = { ...lineFromItem(item, { company: ctx.company, date: date(), price: ctx.itemPrice(item), id }), qty: line.qty || '1', discountPct: line.discountPct };
      if (filledLine.unit && !filledLine.unit.label) filledLine.unit = { ...filledLine.unit, label: unitLabel(filledLine.unit.code, draft.language) };
      setLines(updateLine(draft.lines, id, filledLine));
    },
    onMove: (from, to) => setLines(moveLine(draft.lines, from, to)),
    onDuplicate: (id) => setLines(duplicateLine(draft.lines, id)),
    onRemove: (id) => setLines(removeLine(draft.lines, id))
  });

  const addLine = (kind) => {
    const line = emptyLine({ company: ctx.company, date: date(), kind, unitLabel: unitLabel('C62', draft.language) });
    if (draft.lines.some(l => l.priceType === 'GROSS') && kind === 'ITEM') line.priceType = 'GROSS';
    setLines(insertLine(draft.lines, line));
    setTimeout(() => { const input = list.querySelector(`[data-line-id="${line.id}"] input`); if (input) input.focus(); }, 0);
  };

  const priceMode = isPayer(ctx.company)
    ? selectEl([{ value: 'NET', label: t('documents.editor.priceMode.NET') }, { value: 'GROSS', label: t('documents.editor.priceMode.GROSS') }],
      draft.lines.some(l => l.priceType === 'GROSS') ? 'GROSS' : 'NET', { 'aria-label': t('documents.editor.priceMode') })
    : null;
  if (priceMode) priceMode.addEventListener('change', () => setLines(draft.lines.map(l => (!l.kind || l.kind === 'ITEM' ? { ...l, priceType: priceMode.value } : l))));

  list.addEventListener('dragover', (e) => e.preventDefault());
  list.addEventListener('drop', (e) => {
    e.preventDefault();
    const from = Number(e.dataTransfer.getData('text/plain'));
    const target = e.target.closest('[data-index]');
    if (!Number.isInteger(from) || !target) return;
    setLines(moveLine(draft.lines, from, Number(target.dataset.index)));
  });

  const draw = (next) => {
    draft = next;
    refs.clear();
    while (list.firstChild) list.removeChild(list.firstChild);
    const c = lineCtx();
    draft.lines.forEach((line, i) => list.append(lineRow(line, i, draft.lines.length, c)));
    if (!draft.lines.length) list.append(h('p', { class: 'muted' }, t('documents.editor.noLines')));
    refreshIcons(list);
  };

  el.append(
    h('div', { class: 'editor-section-head' }, h('h2', { id: 'editor-lines-title' }, t('documents.editor.lines')), priceMode),
    list,
    h('div', { class: 'lines-add' },
      h('button', { type: 'button', class: 'btn', id: 'editor-add-line', onclick: () => addLine('ITEM') }, icon('plus'), t('documents.editor.addItem')),
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => addLine('TEXT') }, icon('plus'), t('documents.editor.addText')),
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => addLine('SUBTOTAL') }, icon('plus'), t('documents.editor.addSubtotal'))),
    discountField(draft, (patch) => ctx.onDraft(patch, { redraw: false })));
  draw(draft);

  return {
    el,
    draw,
    setDraft(next) { draft = next; },
    // Line totals and running subtotals from computeTotals().lines.
    showTotals(totals, currency) {
      const byId = new Map(((totals && totals.lines) || []).map(l => [l.id, l]));
      let running = '0';
      draft.lines.forEach(line => {
        const ref = refs.get(line.id);
        const amounts = byId.get(line.id);
        if (amounts) running = add(running, amounts.net);
        if (!ref || !ref.total) return;
        if (line.kind === 'SUBTOTAL') ref.total.textContent = formatAmount(running, currency);
        else ref.total.textContent = amounts ? formatAmount(amounts.net, currency) : '';
      });
    },
    // Errors of missingParticulars on lines: "lines[2].name" -> the name cell of the third line.
    showErrors(missing) {
      refs.forEach(ref => Object.values(ref.errors).forEach(set => set(null)));
      missing.forEach(m => {
        const hit = /^lines\[(\d+)\]\.(\w+)$/.exec(m.field);
        if (!hit) return;
        const line = draft.lines[Number(hit[1])];
        const ref = line && refs.get(line.id);
        const set = ref && ref.errors[hit[2]];
        if (set) set(t(`document.missing.${m.code}`));
      });
    }
  };
}
