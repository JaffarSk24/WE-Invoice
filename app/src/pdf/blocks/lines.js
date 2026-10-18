// The line table: the columns the template lists, the header row repeated
// on every page (headerRows: 1), rows never split across pages. Text
// lines span the table, subtotal lines print the running sum.
import { LINE_COLUMNS } from '../templates/index.js';

function vatRateText(ctx, line) {
  const category = line.vatCategory || 'S';
  if (category === 'S') return ctx.labels.L('vat.short.S', { rate: ctx.fmt.number(line.vatRate || '0', 2) });
  return ctx.labels.L(`vat.short.${category}`);
}

export function activeColumns(ctx) {
  const { template, vatPayer, lines } = ctx;
  const ids = vatPayer ? template.columns : template.columnsNonPayer;
  const hasDiscount = lines.some(l => l.discountPct && !/^0*(\.0+)?$/.test(String(l.discountPct)));
  return ids.filter(id => id !== 'discount' || hasDiscount);
}

function headerCell(ctx, id) {
  const { labels, theme, template, vatPayer } = ctx;
  const column = LINE_COLUMNS[id];
  let label = labels.L(column.label);
  if (id === 'net' && !vatPayer) label = labels.L('field.lineTotal');
  if (id === 'unitPrice' && !vatPayer) label = labels.L('field.unitPriceGross');
  const cell = { text: label, bold: true, alignment: column.align, fontSize: theme.small + 0.5 };
  if (template.tableHeader === 'filled') { cell.fillColor = theme.brand; cell.color = theme.onBrand; }
  else if (template.tableHeader === 'tinted') { cell.fillColor = theme.tint; cell.color = theme.brand; }
  else cell.color = theme.text;
  return cell;
}

function descriptionCell(line) {
  const stack = [{ text: line.name || '' }];
  if (line.description) stack.push({ text: line.description, style: 'lineDescription' });
  return stack.length === 1 ? stack[0] : { stack };
}

function itemCell(ctx, id, line, index) {
  const { fmt, template } = ctx;
  const a = line.amounts;
  const align = LINE_COLUMNS[id].align;
  const text = {
    n: String(index),
    description: null,
    qty: template.qtyWithUnit ? `${fmt.qty(line.qty)} ${(line.unit && line.unit.label) || ''}`.trim() : fmt.qty(line.qty),
    unit: (line.unit && line.unit.label) || '',
    unitPrice: fmt.amount(a.unitNet),
    discount: line.discountPct ? fmt.percent(line.discountPct) : '',
    vatRate: vatRateText(ctx, line),
    net: fmt.amount(a.net),
    vat: fmt.amount(a.vat),
    gross: fmt.amount(a.gross)
  }[id];
  if (id === 'description') return descriptionCell(line);
  return { text, alignment: align };
}

function textRow(ctx, line, span) {
  const { theme } = ctx;
  const cell = { text: line.name || line.description || '', colSpan: span, italics: true, color: theme.muted };
  return [cell, ...Array(span - 1).fill({})];
}

function subtotalRow(ctx, line, columns) {
  const { fmt, labels, theme } = ctx;
  return columns.map(id => {
    if (id === 'n') return { text: '' };
    if (id === 'description') return { text: line.name || labels.L('totals.subtotal'), bold: true, color: theme.muted };
    if (id === 'net') return { text: fmt.amount(line.amounts.net), bold: true, alignment: 'right' };
    if (id === 'vat') return { text: fmt.amount(line.amounts.vat), bold: true, alignment: 'right' };
    if (id === 'gross') return { text: fmt.amount(line.amounts.gross), bold: true, alignment: 'right' };
    return { text: '' };
  });
}

function tableLayout(ctx) {
  const { theme, template } = ctx;
  const pad = template.id === 'COMPACT' ? 2.5 : 4;
  const base = { paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => pad, paddingBottom: () => pad };
  if (template.tableLines === 'grid') {
    return { ...base, hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => theme.line, vLineColor: () => theme.line };
  }
  if (template.tableLines === 'hairline') {
    return { ...base, hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0.75 : 0.25), vLineWidth: () => 0, hLineColor: (i, node) => (i === 0 || i === node.table.body.length ? theme.text : theme.lineLight) };
  }
  return { ...base, hLineWidth: (i, node) => (i === 1 || i === node.table.body.length ? 0.75 : 0.3), vLineWidth: () => 0, hLineColor: (i, node) => (i === 1 || i === node.table.body.length ? theme.brand : theme.lineLight) };
}

export function linesBlock(ctx) {
  const { lines, theme } = ctx;
  const columns = activeColumns(ctx);
  const body = [columns.map(id => headerCell(ctx, id))];
  let index = 0;
  lines.forEach(line => {
    if (line.kind === 'TEXT') body.push(textRow(ctx, line, columns.length));
    else if (line.kind === 'SUBTOTAL') body.push(subtotalRow(ctx, line, columns));
    else { index += 1; body.push(columns.map(id => itemCell(ctx, id, line, index))); }
  });
  return {
    table: { headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 1, widths: columns.map(id => LINE_COLUMNS[id].width), body },
    layout: tableLayout(ctx),
    margin: [0, 0, 0, theme.gap]
  };
}
