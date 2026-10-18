// Supplier and customer blocks: name, address, IČO, DIČ, IČ DPH, the
// register entry (§ 3a ObZ) and the contacts of the supplier. Laid out
// as framed boxes, tinted panels or plain columns by the template.

function regionName(code, locale) {
  if (!code) return '';
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
}

export function addressLines(address, { otherCountry = null, locale = 'sk-SK' } = {}) {
  if (!address) return [];
  const lines = [];
  if (address.street) lines.push(address.street);
  const city = [address.zip, address.city].filter(Boolean).join(' ');
  if (city) lines.push(city);
  if (address.country && address.country !== otherCountry) lines.push(regionName(address.country, locale));
  return lines;
}

function idLines(party, labels) {
  const rows = [];
  if (party.ico) rows.push(`${labels.L('field.ico')}: ${party.ico}`);
  if (party.dic) rows.push(`${labels.L('field.dic')}: ${party.dic}`);
  if (party.icDph) rows.push(`${labels.L('field.icDph')}: ${party.icDph}`);
  return rows;
}

// The stack of one party: heading, name in bold, address, identifiers.
export function partyStack(ctx, role, party, extra = []) {
  const { labels, theme, fmt } = ctx;
  const other = role === 'seller' ? ctx.doc.buyer : ctx.doc.seller;
  const otherCountry = other && other.address ? other.address.country : null;
  const country = party.address && party.address.country;
  const stack = [
    { text: labels.L(role === 'seller' ? 'field.supplier' : 'field.customer'), fontSize: theme.small, color: theme.muted, margin: [0, 0, 0, 3] },
    { text: party.name || '', bold: true, fontSize: theme.fontSize + 1.5, margin: [0, 0, 0, 2] }
  ];
  addressLines(party.address, { otherCountry: country === otherCountry ? country : null, locale: fmt.locale })
    .forEach(line => stack.push({ text: line }));
  const ids = idLines(party, labels);
  if (ids.length) stack.push({ text: ids.join('\n'), margin: [0, 4, 0, 0] });
  extra.forEach(node => stack.push(node));
  return stack;
}

function sellerExtras(ctx) {
  const { doc, company, theme, labels } = ctx;
  const seller = doc.seller;
  const extras = [];
  const registerEntry = seller.registerEntry || (company && company.registerEntry);
  if (registerEntry) extras.push({ text: registerEntry, fontSize: theme.small, color: theme.muted, margin: [0, 4, 0, 0] });
  const contacts = [];
  const email = seller.email || (company && company.email);
  const phone = seller.phone || (company && company.phone);
  if (email) contacts.push(`${labels.L('field.email')}: ${email}`);
  if (phone) contacts.push(`${labels.L('field.phone')}: ${phone}`);
  if (contacts.length) extras.push({ text: contacts.join('\n'), fontSize: theme.small, color: theme.muted, margin: [0, 3, 0, 0] });
  return extras;
}

function box(ctx, stack) {
  const { theme, template } = ctx;
  if (template.partyBoxes === 'framed') {
    return {
      table: { widths: ['*'], body: [[{ stack, margin: [8, 7, 8, 8] }]] },
      layout: { hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineColor: () => theme.line, vLineColor: () => theme.line }
    };
  }
  if (template.partyBoxes === 'tinted') {
    return { table: { widths: ['*'], body: [[{ stack, fillColor: theme.tint, margin: [9, 8, 9, 9] }]] }, layout: 'noBorders' };
  }
  return { stack };
}

export function partiesBlock(ctx) {
  const { doc, theme } = ctx;
  const seller = box(ctx, partyStack(ctx, 'seller', doc.seller || {}, sellerExtras(ctx)));
  const buyer = box(ctx, partyStack(ctx, 'buyer', doc.buyer || {}));
  return { columns: [{ width: '*', ...seller }, { width: '*', ...buyer }], columnGap: 16, margin: [0, 0, 0, theme.gap] };
}
