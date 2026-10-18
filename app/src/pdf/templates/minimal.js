// Minimalistický: black text, a lot of air, one thin rule under the head
// and hairlines in the table; the brand colour only on the title. The
// unit goes next to the quantity so the table stays narrow.
import { logoNode, titleColumn } from '../blocks/header.js';

export const MINIMAL = Object.freeze({
  id: 'MINIMAL',
  fontSize: 9.5,
  smallSize: 7.5,
  titleSize: 18,
  gap: 18,
  pageMargins: [48, 56, 48, 72],
  columns: ['n', 'description', 'qty', 'unitPrice', 'vatRate', 'net', 'gross'],
  columnsNonPayer: ['n', 'description', 'qty', 'unitPrice', 'discount', 'net'],
  qtyWithUnit: true,
  partyBoxes: 'plain',
  tableHeader: 'plain',
  tableLines: 'hairline',
  totalsFill: false,
  header(ctx) {
    const { theme } = ctx;
    const logo = logoNode(ctx, [120, 44]);
    return {
      stack: [
        {
          columns: [
            { width: '*', ...titleColumn(ctx, { align: 'left', color: theme.text }) },
            logo ? { width: 'auto', ...logo } : { width: 'auto', text: '' }
          ],
          columnGap: 12
        },
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.75, lineColor: theme.brand }], margin: [0, 8, 0, 0] }
      ],
      margin: [0, 0, 0, theme.gap]
    };
  }
});
