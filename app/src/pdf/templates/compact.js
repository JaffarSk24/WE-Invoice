// Kompaktný: smaller type and tighter margins for documents with many
// lines; the title, the number and the logo share one row, parties sit in
// plain columns, the table drops the VAT amount column.
import { logoNode, titleColumn } from '../blocks/header.js';

export const COMPACT = Object.freeze({
  id: 'COMPACT',
  fontSize: 8,
  smallSize: 6.8,
  titleSize: 15,
  gap: 9,
  pageMargins: [32, 36, 32, 58],
  columns: ['n', 'description', 'qty', 'unit', 'unitPrice', 'discount', 'vatRate', 'net', 'gross'],
  columnsNonPayer: ['n', 'description', 'qty', 'unit', 'unitPrice', 'discount', 'net'],
  partyBoxes: 'plain',
  tableHeader: 'tinted',
  tableLines: 'horizontal',
  totalsFill: true,
  header(ctx) {
    const { theme } = ctx;
    const logo = logoNode(ctx, [110, 34]);
    return {
      columns: [
        { width: '*', ...titleColumn(ctx, { align: 'left' }) },
        logo ? { width: 'auto', ...logo } : { width: 'auto', text: '' }
      ],
      columnGap: 10,
      margin: [0, 0, 0, theme.gap]
    };
  }
});
