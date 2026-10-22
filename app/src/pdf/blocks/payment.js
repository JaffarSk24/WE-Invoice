// Payment band: one compact strip under the dates, as on the usual Slovak
// invoices. Bank account (IBAN, BIC) at the left, the payment symbols in the
// middle, the method and the amount due at the right, the payment QR (PAY by
// square or QR Platba) at the edge. A paid document says so instead; a
// document without an amount due or without a bank account prints no band.
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
  // The column is as wide as the caption, and the code sits in its middle,
  // right above the centre of the caption.
  return {
    width: 84,
    stack: [
      { qr: qr.text, fit: 64, eccLevel: 'M', foreground: theme.text, alignment: 'center' },
      { text: caption, fontSize: theme.small, bold: true, alignment: 'center', margin: [0, 3, 0, 0] },
    ]
  };
}

function pairs(rows, theme) {
  return {
    table: {
      widths: ['auto', 'auto'],
      body: rows.map(([label, value]) => [
        { text: label, color: theme.muted, fontSize: theme.small + 0.5, noWrap: true },
        { text: value, bold: true }
      ])
    },
    layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 6, paddingTop: () => 1, paddingBottom: () => 1 }
  };
}

export function paymentBlock(ctx) {
  const { doc, theme, labels, template, payableShown, paidInFull, bank, fmt, due } = ctx;
  if (!payableShown) return null;
  if (paidInFull) {
    return { text: labels.L('payment.paid'), bold: true, color: theme.brand, margin: [0, 0, 0, theme.gap] };
  }
  const L = labels.L;
  const account = [];
  if (bank) {
    account.push([L('field.iban'), bank.iban.replace(/(.{4})/g, '$1 ').trim()]);
    if (bank.bic) account.push([L('field.bic'), bank.bic]);
  }
  const symbols = [];
  if (doc.vs) symbols.push([L('field.vs'), doc.vs]);
  if (doc.ks) symbols.push([L('field.ks'), doc.ks]);
  if (doc.ss) symbols.push([L('field.ss'), doc.ss]);
  const amount = {
    width: 96,
    alignment: 'right',
    stack: [
      doc.paymentMethod ? { text: L(`method.${doc.paymentMethod}`), fontSize: theme.small + 0.5, color: theme.muted, alignment: 'right' } : null,
      { text: L('field.payable'), fontSize: theme.small + 0.5, color: theme.muted, alignment: 'right', margin: [0, 4, 0, 0] },
      { text: fmt.money(due, doc.currency), bold: true, fontSize: theme.fontSize + 4, alignment: 'right', noWrap: true }
    ].filter(Boolean)
  };
  // The account takes the free width, the symbols what they need, the
  // amount a fixed column: nothing wraps and nothing leaves the page.
  const columns = [];
  // Label and value on one line ("IBAN SK31 ..."), so the IBAN never wraps.
  const inline = ([label, value]) => ({
    text: [{ text: `${label}  `, color: theme.muted, fontSize: theme.small + 0.5 }, { text: value, bold: true }],
    noWrap: true,
    margin: [0, 1, 0, 1]
  });
  columns.push(account.length ? { width: '*', stack: account.map(inline) } : { width: '*', text: '' });
  if (symbols.length) columns.push({ width: 'auto', ...pairs(symbols, theme) });
  columns.push(amount);
  const qr = qrColumn(ctx);
  const inner = { columns: qr ? [...columns, qr] : columns, columnGap: 12 };
  const node = template.partyBoxes === 'tinted'
    ? { table: { widths: ['*'], body: [[{ ...inner, fillColor: theme.tint, margin: [9, 8, 9, 8] }]] }, layout: 'noBorders' }
    : template.partyBoxes === 'framed'
      ? { table: { widths: ['*'], body: [[{ ...inner, margin: [8, 7, 8, 7] }]] }, layout: { hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineColor: () => theme.line, vLineColor: () => theme.line } }
      : inner;
  return { unbreakable: true, stack: [node], margin: [0, 0, 0, theme.gap] };
}
