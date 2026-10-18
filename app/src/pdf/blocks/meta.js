// Dates and references of the document: issue date, date of supply (or
// of payment receipt, or of delivery, by the kind), due date, validity,
// period, payment method, symbols and the references to orders, contracts
// and corrected or advance documents.

const PAYABLE_KINDS = new Set(['INVOICE', 'PROFORMA', 'DEBIT_NOTE', 'REMINDER', 'SELF_BILLING']);

function taxDateLabel(kind) {
  if (kind === 'ADVANCE_TAX_DOC') return 'field.paymentReceivedDate';
  if (kind === 'DELIVERY_NOTE' || kind === 'ORDER_IN' || kind === 'ORDER_OUT') return 'field.deliveryDate';
  return 'field.taxDate';
}

function linkNumber(link, options) {
  if (link.number) return link.number;
  const map = options.linkedNumbers || {};
  return map[link.docId] || link.docId;
}

/** @returns {Array<[string, string]>} label and value rows */
export function metaRows(ctx) {
  const { doc, labels, fmt } = ctx;
  const L = labels.L;
  const rows = [];
  // The payment band prints the method and the symbols.
  const inBand = Boolean(ctx.payableShown && !ctx.paidInFull);
  if (doc.issueDate) rows.push([L('field.issueDate'), fmt.date(doc.issueDate)]);
  const supplyDate = doc.kind === 'DELIVERY_NOTE' ? (doc.deliveryDate || doc.taxDate) : (doc.taxDate || doc.deliveryDate);
  if (supplyDate && doc.kind !== 'QUOTE') rows.push([L(taxDateLabel(doc.kind)), fmt.date(supplyDate)]);
  if (doc.dueDate && PAYABLE_KINDS.has(doc.kind)) rows.push([L('field.dueDate'), fmt.date(doc.dueDate)]);
  if (doc.validUntil) rows.push([L('field.validUntil'), fmt.date(doc.validUntil)]);
  if (doc.periodFrom || doc.periodTo) rows.push([L('field.period'), [fmt.date(doc.periodFrom), fmt.date(doc.periodTo)].filter(Boolean).join(' - ')]);
  if (doc.paymentMethod && PAYABLE_KINDS.has(doc.kind) && !inBand) rows.push([L('field.paymentMethod'), L(`method.${doc.paymentMethod}`)]);
  if (doc.vs && PAYABLE_KINDS.has(doc.kind) && !inBand) rows.push([L('field.vs'), doc.vs]);
  if (doc.orderReference) rows.push([L('field.orderReference'), doc.orderReference]);
  if (doc.contractReference) rows.push([L('field.contractReference'), doc.contractReference]);
  if (doc.buyerReference) rows.push([L('field.buyerReference'), doc.buyerReference]);
  if (doc.currency && doc.currency !== 'EUR' && doc.fxRate) rows.push([L('field.fxRate'), fmt.rate(doc.fxRate, 'EUR', doc.currency)]);
  return rows;
}

/** Sentences printed under the meta table: corrected document, advances. */
export function referenceLines(ctx) {
  const { doc, labels, options } = ctx;
  const lines = [];
  (doc.links || []).forEach(link => {
    const number = linkNumber(link, options);
    if (link.kind === 'CORRECTS') lines.push(labels.L('field.correctsReference', { number }));
    else if (link.kind === 'FROM_PROFORMA') lines.push(labels.L('field.proformaReference', { number }));
    else if (link.kind === 'ADVANCE_DEDUCTION') lines.push(labels.L('field.advanceReference', { number }));
  });
  if (doc.correctionReason) lines.push(`${labels.L('field.correctionReason')}: ${doc.correctionReason}`);
  return lines;
}

const META_COLUMNS = 4;

export function metaBlock(ctx) {
  const { theme } = ctx;
  const rows = metaRows(ctx);
  const refs = referenceLines(ctx);
  if (!rows.length && !refs.length) return null;
  // A grid of four columns, label above value: the dates take one or two
  // lines of the page instead of a column of six.
  const cells = rows.map(([label, value]) => ({
    stack: [
      { text: label, color: theme.muted, fontSize: theme.small },
      { text: value, bold: true, margin: [0, 1, 0, 0] }
    ]
  }));
  const body = [];
  for (let i = 0; i < cells.length; i += META_COLUMNS) {
    const row = cells.slice(i, i + META_COLUMNS);
    while (row.length < META_COLUMNS) row.push({ text: '' });
    body.push(row);
  }
  const stack = [];
  if (body.length) {
    stack.push({
      table: { widths: Array(META_COLUMNS).fill('*'), body },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 10, paddingTop: () => 2, paddingBottom: () => 4 }
    });
  }
  refs.forEach(text => stack.push({ text, margin: [0, 4, 0, 0] }));
  return { stack, margin: [0, 0, 0, theme.gap] };
}
