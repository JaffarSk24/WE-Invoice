// Payment block: method, IBAN, BIC, symbols, the amount due and the due
// date at the left, the payment QR (PAY by square or QR Platba) at the
// right. A paid document says so instead of the QR; a document without
// an amount due or without a bank account prints no block.

export function paymentRows(ctx) {
  const { doc, labels, fmt, bank, due } = ctx;
  const L = labels.L;
  const rows = [];
  if (doc.paymentMethod) rows.push([L('field.paymentMethod'), L(`method.${doc.paymentMethod}`)]);
  if (bank) {
    rows.push([L('field.iban'), bank.iban.replace(/(.{4})/g, '$1 ').trim()]);
    if (bank.bic) rows.push([L('field.bic'), bank.bic]);
  }
  if (doc.vs) rows.push([L('field.vs'), doc.vs]);
  if (doc.ks) rows.push([L('field.ks'), doc.ks]);
  if (doc.ss) rows.push([L('field.ss'), doc.ss]);
  if (doc.dueDate) rows.push([L('field.dueDate'), fmt.date(doc.dueDate)]);
  rows.push([L('field.payable'), fmt.money(due, doc.currency)]);
  return rows;
}

function qrColumn(ctx) {
  const { qr, labels, theme } = ctx;
  if (!qr) return null;
  const caption = qr.format === 'QR_PLATBA' ? labels.L('payment.qrPlatba') : labels.L('payment.payBySquare');
  return {
    width: 'auto',
    stack: [
      { qr: qr.text, fit: 108, eccLevel: 'M', foreground: theme.text },
      { text: caption, fontSize: theme.small, bold: true, alignment: 'center', margin: [0, 3, 0, 0] },
      { text: labels.L('payment.scan'), fontSize: theme.small, color: theme.muted, alignment: 'center' }
    ]
  };
}

export function paymentBlock(ctx) {
  const { theme, labels, template, payableShown, paidInFull } = ctx;
  if (!payableShown) return null;
  if (paidInFull) {
    return { text: labels.L('payment.paid'), bold: true, color: theme.brand, margin: [0, 0, 0, theme.gap] };
  }
  const rows = paymentRows(ctx);
  const body = rows.map(([label, value], i) => {
    const last = i === rows.length - 1;
    return [
      { text: label, color: theme.muted, fontSize: theme.small + 0.5, bold: last },
      { text: value, bold: true, fontSize: last ? theme.fontSize + 1 : theme.fontSize }
    ];
  });
  const details = {
    width: '*',
    stack: [
      { text: labels.L('payment.title'), fontSize: theme.small, color: theme.muted, margin: [0, 0, 0, 3] },
      {
        table: { widths: ['auto', '*'], body },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 10, paddingTop: () => 1.5, paddingBottom: () => 1.5 }
      }
    ]
  };
  const qr = qrColumn(ctx);
  const inner = { columns: qr ? [details, qr] : [details], columnGap: 16 };
  const node = template.partyBoxes === 'tinted'
    ? { table: { widths: ['*'], body: [[{ ...inner, fillColor: theme.tint, margin: [9, 8, 9, 9] }]] }, layout: 'noBorders' }
    : template.partyBoxes === 'framed'
      ? { table: { widths: ['*'], body: [[{ ...inner, margin: [8, 7, 8, 8] }]] }, layout: { hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineColor: () => theme.line, vLineColor: () => theme.line } }
      : inner;
  return { unbreakable: true, stack: [node], margin: [0, 0, 0, theme.gap] };
}
