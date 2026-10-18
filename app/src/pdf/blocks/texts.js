// Free texts and legal notes: the intro above the lines, the outro and
// the legal notes (reverse charge, exemption, non-payer...) under the
// totals, then the stamp and signature with the name of the issuer.

export function introBlock(ctx) {
  const { doc, theme } = ctx;
  if (!doc.textIntro) return null;
  return { text: doc.textIntro, margin: [0, 0, 0, theme.gap] };
}

export function legalBlock(ctx) {
  const { legal, theme } = ctx;
  if (!legal.length) return null;
  return { stack: legal.map(note => ({ text: note.text, bold: true })), margin: [0, 0, 0, theme.gap] };
}

export function outroBlock(ctx) {
  const { doc, theme } = ctx;
  if (!doc.textOutro) return null;
  return { text: doc.textOutro, fontSize: theme.small + 1, color: theme.muted, margin: [0, 0, 0, theme.gap] };
}

export function signatureBlock(ctx) {
  const { images, labels, theme, options, doc } = ctx;
  const issuedBy = options.issuedBy || null;
  if (!images.stamp && !images.signature && !issuedBy && doc.kind !== 'DELIVERY_NOTE') return null;
  const pictures = [];
  if (images.stamp) pictures.push({ image: 'stamp', fit: [110, 70] });
  if (images.signature) pictures.push({ image: 'signature', fit: [120, 50] });
  const right = {
    width: 200,
    stack: [
      pictures.length ? { columns: pictures.map(p => ({ width: 'auto', ...p })), columnGap: 8, alignment: 'center', margin: [0, 0, 0, 4] } : { text: '', margin: [0, 0, 0, 34] },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.5, lineColor: theme.line }] },
      { text: labels.L('field.signature'), fontSize: theme.small, color: theme.muted, alignment: 'center', margin: [0, 3, 0, 0] },
      issuedBy ? { text: `${labels.L('field.issuedBy')}: ${issuedBy}`, fontSize: theme.small, alignment: 'center', margin: [0, 2, 0, 0] } : null
    ].filter(Boolean)
  };
  const left = doc.kind === 'DELIVERY_NOTE' ? {
    width: 200,
    stack: [
      { text: '', margin: [0, 0, 0, pictures.length ? 78 : 34] },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.5, lineColor: theme.line }] },
      { text: labels.L('field.receivedBy'), fontSize: theme.small, color: theme.muted, alignment: 'center', margin: [0, 3, 0, 0] }
    ]
  } : { width: '*', text: '' };
  return { unbreakable: true, columns: [left, { width: '*', text: '' }, right], margin: [0, theme.gap, 0, 0] };
}
