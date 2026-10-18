// One line of the editor: an item (name with suggestions from the price
// list, description, quantity, unit, price, discount, VAT, the line
// total), a text line (heading or separator) or a subtotal. A typed value
// changes the draft without redrawing, so the focus stays; the VAT and
// structure changes redraw the lines. Numbers keep at most 4 decimals.
import { h, icon, selectEl } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { parseDecimal, toInputText } from '../../components/decimal.js';
import { autocomplete } from '../../components/autocomplete.js';
import { UNIT_CODES, vatChoices, vatChoiceOf, EXEMPT_CATEGORIES } from './draft.js';
import { unitLabel } from './units.js';

const FOUR_PLACES = /^-?\d+(\.\d{1,4})?$/;

function numberInput({ value, label, onValue, setError, cls = '' }) {
  const input = h('input', { type: 'text', inputmode: 'decimal', class: `num ${cls}`.trim(), value: toInputText(value), 'aria-label': label, autocomplete: 'off' });
  input.addEventListener('change', () => {
    const raw = input.value.trim();
    if (!raw && cls.includes('optional')) { setError(null); onValue(null); return; }
    const parsed = parseDecimal(raw);
    if (parsed === null || !FOUR_PLACES.test(parsed)) { setError(t('documents.editor.invalidNumber')); return; }
    setError(null);
    input.value = toInputText(parsed);
    onValue(parsed);
  });
  return input;
}

function cell(label, control, cls) {
  const error = h('span', { class: 'line-error', role: 'alert', hidden: true });
  const el = h('div', { class: `line-cell ${cls}` }, h('span', { class: 'line-label' }, label), control, error);
  const setError = (message) => {
    error.textContent = message || '';
    error.hidden = !message;
    el.classList.toggle('field-invalid', Boolean(message));
    if (control && control.setAttribute) control.setAttribute('aria-invalid', message ? 'true' : 'false');
  };
  return { el, setError };
}

function tools(line, index, count, ctx) {
  const btn = (name, label, onclick, disabled = false) => h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': label, title: label, disabled, onclick }, icon(name));
  return h('div', { class: 'line-tools' },
    btn('arrow-up', t('documents.editor.line.up'), () => ctx.onMove(index, index - 1), index === 0),
    btn('arrow-down', t('documents.editor.line.down'), () => ctx.onMove(index, index + 1), index === count - 1),
    btn('copy', t('documents.editor.line.copy'), () => ctx.onDuplicate(line.id)),
    btn('trash-2', t('documents.editor.line.remove'), () => ctx.onRemove(line.id)));
}

function dragHandle(index, ctx) {
  return h('span', { class: 'line-drag', draggable: 'true', title: t('documents.editor.line.drag'), 'aria-hidden': 'true',
    ondragstart: (e) => { e.dataTransfer.setData('text/plain', String(index)); e.dataTransfer.effectAllowed = 'move'; } }, icon('grip-vertical'));
}

function itemRow(line, index, count, ctx) {
  const errors = {};
  const set = (patch) => ctx.onChange(line.id, patch);
  const name = autocomplete({
    label: null, value: line.name || '', placeholder: t('documents.editor.line.namePlaceholder'),
    search: (q) => ctx.searchItems(q), onPick: (item) => ctx.onPickItem(line.id, item.id)
  });
  name.input.setAttribute('aria-label', t('documents.editor.line.name'));
  name.input.addEventListener('input', () => set({ name: name.input.value, itemId: null }));
  const nameCell = cell(t('documents.editor.line.name'), name.el, 'line-name');
  errors.name = nameCell.setError;

  const description = h('textarea', { rows: 2, class: 'line-description', 'aria-label': t('documents.editor.line.description'), placeholder: t('documents.editor.line.description'), hidden: !line.description }, line.description || '');
  description.addEventListener('input', () => set({ description: description.value }));
  const descToggle = h('button', { type: 'button', class: 'btn btn-ghost btn-sm line-desc-toggle', hidden: Boolean(line.description), onclick: () => { description.hidden = false; descToggle.hidden = true; description.focus(); } }, icon('plus'), t('documents.editor.line.addDescription'));
  nameCell.el.append(description, descToggle);

  const qtyCell = cell(t('documents.editor.line.qty'), null, 'line-qty');
  const qty = numberInput({ value: line.qty, label: t('documents.editor.line.qty'), onValue: (v) => set({ qty: v }), setError: qtyCell.setError });
  qtyCell.el.insertBefore(qty, qtyCell.el.querySelector('.line-error'));
  errors.qty = qtyCell.setError;

  const unitCode = line.unit && line.unit.code;
  const unitOptions = UNIT_CODES.map(code => ({ value: code, label: unitLabel(code, ctx.language) }));
  if (unitCode && !UNIT_CODES.includes(unitCode)) unitOptions.push({ value: unitCode, label: (line.unit && line.unit.label) || unitCode });
  const unit = selectEl(unitOptions, unitCode || 'C62', { 'aria-label': t('documents.editor.line.unit') });
  unit.addEventListener('change', () => set({ unit: { code: unit.value, label: unitLabel(unit.value, ctx.language) || unit.value } }));
  const unitCell = cell(t('documents.editor.line.unit'), unit, 'line-unit');

  const priceCell = cell(ctx.grossPrices ? t('documents.editor.line.priceGross') : t('documents.editor.line.price'), null, 'line-price');
  const price = numberInput({ value: line.unitPrice, label: t('documents.editor.line.price'), onValue: (v) => set({ unitPrice: v }), setError: priceCell.setError });
  priceCell.el.insertBefore(price, priceCell.el.querySelector('.line-error'));
  errors.unitPrice = priceCell.setError;

  const discountCell = cell(t('documents.editor.line.discount'), null, 'line-discount');
  const discount = numberInput({ value: line.discountPct, label: t('documents.editor.line.discount'), onValue: (v) => set({ discountPct: v }), setError: discountCell.setError, cls: 'optional' });
  discountCell.el.insertBefore(discount, discountCell.el.querySelector('.line-error'));

  const cells = [nameCell.el, qtyCell.el, unitCell.el, priceCell.el, discountCell.el];
  if (ctx.payer) {
    const choices = vatChoices(ctx.date);
    const current = vatChoiceOf(line);
    const options = choices.map(c => ({ value: c.value, label: c.category === 'S' ? t('documents.editor.vat.rate', { rate: c.rate }) : t(`documents.editor.vat.${c.category}`) }));
    if (!options.some(o => o.value === current)) options.push({ value: current, label: t('documents.editor.vat.rate', { rate: line.vatRate ?? '?' }) });
    const vat = selectEl(options, current, { 'aria-label': t('documents.editor.line.vat') });
    vat.addEventListener('change', () => ctx.onVat(line.id, vat.value));
    const vatCell = cell(t('documents.editor.line.vat'), vat, 'line-vat');
    errors.vatRate = vatCell.setError;
    errors.vatCategory = vatCell.setError;
    cells.push(vatCell.el);
  }
  const total = h('span', { class: 'line-total num', dataset: { lineTotal: line.id } }, '');
  cells.push(h('div', { class: 'line-cell line-amount' }, h('span', { class: 'line-label' }, t('documents.editor.line.total')), total));

  let exemption = null;
  if (EXEMPT_CATEGORIES.includes(line.vatCategory) && ctx.payer) {
    const input = h('input', { type: 'text', value: line.exemptionReasonText || '', 'aria-label': t('documents.editor.line.exemption'), placeholder: t('documents.editor.line.exemption') });
    input.addEventListener('input', () => set({ exemptionReasonText: input.value || null }));
    const exemptionCell = cell(t('documents.editor.line.exemption'), input, 'line-exemption');
    errors.exemptionReasonCode = exemptionCell.setError;
    exemption = exemptionCell.el;
  }
  ctx.registerLine(line.id, { errors, total });
  return h('div', { class: 'line line-item', dataset: { lineId: line.id, index: String(index) } },
    dragHandle(index, ctx), h('div', { class: 'line-grid' }, cells), exemption, tools(line, index, count, ctx));
}

function textRow(line, index, count, ctx) {
  const input = h('input', { type: 'text', class: 'line-text-input', value: line.name || '', 'aria-label': t('documents.editor.line.text'), placeholder: t('documents.editor.line.text') });
  input.addEventListener('input', () => ctx.onChange(line.id, { name: input.value }));
  ctx.registerLine(line.id, { errors: {}, total: null });
  return h('div', { class: 'line line-text', dataset: { lineId: line.id, index: String(index) } }, dragHandle(index, ctx), input, tools(line, index, count, ctx));
}

function subtotalRow(line, index, count, ctx) {
  const total = h('span', { class: 'line-total num', dataset: { lineTotal: line.id } }, '');
  ctx.registerLine(line.id, { errors: {}, total });
  return h('div', { class: 'line line-subtotal', dataset: { lineId: line.id, index: String(index) } },
    dragHandle(index, ctx), h('span', { class: 'line-subtotal-label' }, t('documents.editor.line.subtotal')), total, tools(line, index, count, ctx));
}

export function lineRow(line, index, count, ctx) {
  if (line.kind === 'TEXT') return textRow(line, index, count, ctx);
  if (line.kind === 'SUBTOTAL') return subtotalRow(line, index, count, ctx);
  return itemRow(line, index, count, ctx);
}
