// Totals and the VAT summary by rate, straight from document.totals (the
// core computes them at issue; nothing is recomputed here). The summary
// sits at the left, the totals column at the right with the amount due
// highlighted. A seller who is not a VAT payer prints no VAT summary: the
// note "Nie je platiteľ DPH" says it all.
import { isZero, isNegative, sum, negate } from '../amounts.js';

function summaryRows(ctx) {
  const { doc, labels, fmt, theme, vatPayer } = ctx;
  if (!vatPayer) return null;
  const breakdown = (doc.totals && doc.totals.breakdown) || [];
  if (!breakdown.length) return null;
  const head = (key) => ({ text: labels.L(key), bold: true, fontSize: theme.small + 0.5, color: theme.muted });
  const body = [[head('vat.rate'), { ...head('vat.base'), alignment: 'right' }, { ...head('vat.amount'), alignment: 'right' }, { ...head('vat.total'), alignment: 'right' }]];
  breakdown.forEach(b => {
    const label = b.category === 'S' ? labels.L('vat.short.S', { rate: fmt.number(b.rate || '0', 2) }) : labels.L(`vat.short.${b.category}`);
    body.push([
      { text: label },
      { text: fmt.amount(b.base), alignment: 'right' },
      { text: fmt.amount(b.vat), alignment: 'right' },
      { text: fmt.amount(sum([b.base, b.vat])), alignment: 'right' }
    ]);
  });
  return body;
}

function totalsRows(ctx) {
  const { doc, labels, fmt, vatPayer, due } = ctx;
  const t = doc.totals || {};
  const cur = doc.currency;
  const rows = [];
  const push = (key, value, opts = {}) => rows.push({ label: labels.L(key), value: fmt.money(value, cur), ...opts });
  const hasAdjustments = !isZero(t.allowances) || !isZero(t.charges);
  if (hasAdjustments) {
    push('totals.lineNet', t.lineNet);
    if (!isZero(t.allowances)) push('totals.discount', negate(t.allowances));
    if (!isZero(t.charges)) push('totals.charges', t.charges);
  }
  if (vatPayer) {
    push('totals.net', t.net);
    push('totals.vat', t.vat);
    if (cur !== 'EUR' && t.vatEur) rows.push({ label: labels.L('totals.vatEur'), value: fmt.money(t.vatEur, 'EUR') });
    push('totals.gross', t.gross, { strong: true });
  } else {
    push('totals.total', t.gross, { strong: true });
  }
  if (!isZero(t.rounding)) push('totals.rounding', t.rounding);
  if (!isZero(t.prepaid)) push('totals.prepaid', negate(t.prepaid));
  if (!isZero(ctx.paid)) push('totals.paid', negate(ctx.paid));
  if (ctx.payableShown) {
    const refund = isNegative(t.payable);
    push(refund ? 'totals.refund' : 'totals.payable', refund ? negate(t.payable) : due, { highlight: true });
  }
  return rows;
}

export function totalsBlock(ctx) {
  const { theme, template } = ctx;
  const summary = summaryRows(ctx);
  const rows = totalsRows(ctx);
  const totalsBody = rows.map(r => {
    const size = r.highlight ? theme.fontSize + 2.5 : (r.strong ? theme.fontSize + 0.5 : theme.fontSize);
    const fill = r.highlight && template.totalsFill ? theme.tint : null;
    return [
      { text: r.label, bold: Boolean(r.strong || r.highlight), fontSize: size, fillColor: fill, margin: [0, r.highlight ? 3 : 0, 0, 0] },
      { text: r.value, bold: Boolean(r.strong || r.highlight), fontSize: size, alignment: 'right', fillColor: fill, margin: [0, r.highlight ? 3 : 0, 0, 0] }
    ];
  });
  const totals = {
    table: { widths: ['*', 'auto'], body: totalsBody },
    layout: {
      hLineWidth: (i, node) => (i === node.table.body.length - 1 && rows[rows.length - 1].highlight ? 0.75 : 0),
      hLineColor: () => theme.brand,
      vLineWidth: () => 0,
      paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 2.5, paddingBottom: () => 2.5
    }
  };
  const left = summary ? {
    stack: [
      { text: ctx.labels.L('vat.summary'), fontSize: theme.small, color: theme.muted, margin: [0, 0, 0, 3] },
      {
        table: { widths: ['auto', '*', '*', '*'], body: summary },
        layout: { hLineWidth: (i) => (i === 1 ? 0.5 : 0), vLineWidth: () => 0, hLineColor: () => theme.line, paddingLeft: () => 0, paddingRight: () => 8, paddingTop: () => 2, paddingBottom: () => 2 }
      }
    ]
  } : { text: '' };
  // Never split the VAT summary and the totals over two pages.
  return { unbreakable: true, columns: [{ width: '*', ...left }, { width: 250, ...totals }], columnGap: 20, margin: [0, 0, 0, theme.gap] };
}
