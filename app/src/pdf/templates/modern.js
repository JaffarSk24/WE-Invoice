// Moderný: a brand-coloured band across the top with the logo and the
// title in white, parties in light tinted panels, a table whose header is
// the brand colour on a light tint, horizontal rules only.
import { logoNode, titleColumn } from '../blocks/header.js';

export const MODERN = Object.freeze({
  id: 'MODERN',
  fontSize: 9,
  smallSize: 7.5,
  titleSize: 22,
  gap: 14,
  pageMargins: [40, 46, 40, 70],
  columns: ['n', 'description', 'qty', 'unit', 'unitPrice', 'discount', 'vatRate', 'net', 'vat', 'gross'],
  columnsNonPayer: ['n', 'description', 'qty', 'unit', 'unitPrice', 'discount', 'net'],
  partyBoxes: 'tinted',
  tableHeader: 'tinted',
  tableLines: 'horizontal',
  totalsFill: true,
  header(ctx) {
    const { theme } = ctx;
    const logo = logoNode(ctx, [150, 50]);
    const inner = {
      columns: [
        logo ? { width: 'auto', ...logo } : { width: '*', text: ctx.doc.seller.name, bold: true, fontSize: theme.fontSize + 4, color: theme.onBrand },
        { width: '*', ...titleColumn(ctx, { color: theme.onBrand }) }
      ],
      columnGap: 12
    };
    // The band: one filled cell across the page, with the content inside.
    inner.columns[1].stack[0].color = theme.onBrand;
    if (inner.columns[1].stack[1]) inner.columns[1].stack[1].color = theme.onBrand;
    return {
      table: { widths: ['*'], body: [[{ ...inner, fillColor: theme.brand, margin: [14, 14, 14, 14] }]] },
      layout: 'noBorders',
      margin: [0, 0, 0, theme.gap]
    };
  }
});
