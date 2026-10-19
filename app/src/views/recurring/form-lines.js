// The lines of a recurring invoice template: name (may contain {period}),
// quantity, unit, unit price without or with VAT and the VAT rate, or a
// line taken from the price list. Values stay decimal strings; the totals
// of each run are computed by the core when the document is issued.
import { h, icon, selectEl } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { uuidv7, vatRatesOn } from '@we-invoice/core';
import { todayLocal } from '../../components/dates.js';
import { UNIT_CODES, itemToLine, decimalText } from '../items/model.js';

function rates() {
  try { return vatRatesOn(todayLocal()).map(r => r.rate); } catch (e) { console.warn('VAT rates unavailable', e); return ['23']; }
}

export function blankLine(vatPayer) {
  return { id: uuidv7(), kind: 'ITEM', name: '', qty: '1', unit: { code: 'C62', label: '' }, unitPrice: '', priceType: 'NET', vatCategory: vatPayer ? 'S' : 'O', vatRate: vatPayer ? '23' : null };
}

// Checks the lines; returns the clean list or an error code.
export function cleanLines(lines) {
  const items = lines.filter(l => l.name.trim() || l.unitPrice !== '');
  if (!items.length) return { error: 'LINES_REQUIRED' };
  for (const l of items) {
    if (!l.name.trim()) return { error: 'NAME_REQUIRED' };
    if (decimalText(l.qty) === null || decimalText(l.unitPrice) === null) return { error: 'PRICE_INVALID' };
  }
  return { lines: items.map(l => ({ ...l, name: l.name.trim(), qty: decimalText(l.qty), unitPrice: decimalText(l.unitPrice) })) };
}

export function linesEditor({ lines, items = [], vatPayer = true }) {
  const rows = [];
  const body = h('div', { class: 'tpl-lines' });

  function addRow(line) {
    const name = h('input', { type: 'text', value: line.name, placeholder: t('recurring.line.name'), 'aria-label': t('recurring.line.name'), class: 'tpl-line-name' });
    const qty = h('input', { type: 'text', inputmode: 'decimal', value: line.qty, 'aria-label': t('recurring.line.qty'), class: 'num tpl-line-qty' });
    const unit = selectEl(UNIT_CODES.map(c => ({ value: c, label: t(`items.unit.${c}`) })), UNIT_CODES.includes(line.unit?.code) ? line.unit.code : 'C62', { 'aria-label': t('items.field.unit') });
    const price = h('input', { type: 'text', inputmode: 'decimal', value: line.unitPrice, placeholder: '0,00', 'aria-label': t('recurring.line.price'), class: 'num tpl-line-price' });
    const priceType = selectEl(['NET', 'GROSS'].map(p => ({ value: p, label: t(`items.priceType.${p}`) })), line.priceType, { 'aria-label': t('items.field.priceType') });
    const rate = vatPayer
      ? selectEl([...rates().map(r => ({ value: `S:${r}`, label: `${r} %` })), ...['E', 'AE', 'K', 'G', 'O'].map(c => ({ value: `${c}:`, label: t(`items.vatCategory.${c}`) }))],
        line.vatCategory === 'S' ? `S:${line.vatRate}` : `${line.vatCategory}:`, { 'aria-label': t('items.field.vatRate') })
      : null;
    const row = h('div', { class: 'tpl-line' }, name, qty, unit, price, priceType, rate,
      h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': t('contacts.removeRow'), onclick: () => { row.remove(); rows.splice(rows.indexOf(entry), 1); } }, icon('x')));
    const entry = {
      read: () => {
        const [category, r] = rate ? rate.value.split(':') : ['O', ''];
        return {
          ...line, name: name.value, qty: qty.value.trim(), unit: { code: unit.value, label: '' }, unitPrice: price.value.trim(),
          priceType: priceType.value, vatCategory: category, vatRate: category === 'S' ? r : null
        };
      }
    };
    rows.push(entry);
    body.append(row);
    refreshIcons(row);
  }

  (lines.length ? lines : [blankLine(vatPayer)]).forEach(addRow);
  const fromItems = items.length
    ? selectEl([{ value: '', label: t('recurring.line.fromItems') }, ...items.map(i => ({ value: i.id, label: i.name }))], '', { 'aria-label': t('recurring.line.fromItems'), id: 'tpl-from-items' })
    : null;
  if (fromItems) {
    fromItems.addEventListener('change', () => {
      const item = items.find(i => i.id === fromItems.value);
      if (item) addRow({ ...itemToLine(item, uuidv7()), unitPrice: String(item.price).replace('.', ',') });
      fromItems.value = '';
    });
  }
  const el = h('fieldset', { class: 'form-section', id: 'tpl-lines' },
    h('legend', {}, t('recurring.section.lines')),
    h('p', { class: 'muted small' }, t('recurring.line.periodHint')),
    body,
    h('div', { class: 'tpl-line-tools' },
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'tpl-add-line', onclick: () => addRow(blankLine(vatPayer)) }, icon('plus'), t('recurring.line.add')),
      fromItems));
  return { el, value: () => rows.map(r => r.read()) };
}
