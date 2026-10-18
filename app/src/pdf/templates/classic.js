// Klasický: logo at the left, the title in the brand colour at the right,
// parties in two framed boxes, a full grid table with a filled header.
import { logoNode, titleColumn } from '../blocks/header.js';

export const CLASSIC = Object.freeze({
  id: 'CLASSIC',
  fontSize: 9,
  smallSize: 7.5,
  titleSize: 20,
  gap: 14,
  pageMargins: [40, 46, 40, 70],
  columns: ['n', 'description', 'qty', 'unit', 'unitPrice', 'discount', 'vatRate', 'net', 'vat', 'gross'],
  columnsNonPayer: ['n', 'description', 'qty', 'unit', 'unitPrice', 'discount', 'net'],
  partyBoxes: 'framed',
  tableHeader: 'filled',
  tableLines: 'grid',
  totalsFill: true,
  header(ctx) {
    const logo = logoNode(ctx, [150, 54]);
    return {
      columns: [
        logo ? { width: 'auto', ...logo } : { width: '*', text: ctx.doc.seller.name, bold: true, fontSize: ctx.theme.fontSize + 3, color: ctx.theme.brand },
        { width: '*', ...titleColumn(ctx) }
      ],
      columnGap: 12,
      margin: [0, 0, 0, ctx.theme.gap]
    };
  }
});
