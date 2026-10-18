// Pieces of the document head shared by the templates: the title with the
// number, the subtitle of a document that is not a tax document, the logo,
// and the small running head of the second and later pages.

export function titleText(ctx) {
  const { labels, doc } = ctx;
  return `${labels.L(`title.${doc.kind}`)} ${doc.number || ''}`.trim();
}

export function subtitleText(ctx) {
  const { labels, doc } = ctx;
  const key = `subtitle.${doc.kind}`;
  const text = labels.L(key);
  return text === key ? null : text;
}

export function logoNode(ctx, fit) {
  if (!ctx.images.logo) return null;
  return { image: 'logo', fit, margin: [0, 0, 0, 0] };
}

// Title column: the big title, the subtitle under it in the muted colour.
export function titleColumn(ctx, { align = 'right', color = null, size = null } = {}) {
  const { theme } = ctx;
  const stack = [{ text: titleText(ctx), fontSize: size || theme.title, bold: true, color: color || theme.brand, alignment: align }];
  const subtitle = subtitleText(ctx);
  if (subtitle) stack.push({ text: subtitle, fontSize: theme.small, color: theme.muted, alignment: align, margin: [0, 2, 0, 0] });
  return { stack };
}

// The running head of pages 2+: "Faktúra 2026001" at the left, nothing on
// the first page (its head is part of the content).
export function runningHead(ctx) {
  const { theme } = ctx;
  const text = titleText(ctx);
  return (currentPage) => {
    if (currentPage === 1) return null;
    return { text, fontSize: theme.small, color: theme.muted, margin: [ctx.pageMargins[0], 20, ctx.pageMargins[2], 0] };
  };
}
