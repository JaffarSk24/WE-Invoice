// Page footer on every page: the supplier's identification (name,
// register entry), the contacts, the company's own footer line, the
// optional "Vystavené vo WE Invoice" and the page number "1/2".

export function footerLines(ctx) {
  const { doc, company, labels } = ctx;
  const seller = doc.seller || {};
  const lines = [];
  const registerEntry = seller.registerEntry || (company && company.registerEntry) || '';
  lines.push([seller.name, registerEntry].filter(Boolean).join(', '));
  const contacts = [];
  const email = seller.email || (company && company.email);
  const phone = seller.phone || (company && company.phone);
  const web = company && company.web;
  if (email) contacts.push(`${labels.L('field.email')}: ${email}`);
  if (phone) contacts.push(`${labels.L('field.phone')}: ${phone}`);
  if (web) contacts.push(`${labels.L('field.web')}: ${web}`);
  if (contacts.length) lines.push(contacts.join(' | '));
  const custom = company && company.defaults && company.defaults.texts && company.defaults.texts.footer;
  if (custom) lines.push(custom);
  return lines.filter(Boolean);
}

export function showMadeWith(ctx) {
  const { company, options } = ctx;
  if (typeof options.showMadeWith === 'boolean') return options.showMadeWith;
  if (company && company.defaults && typeof company.defaults.showMadeWith === 'boolean') return company.defaults.showMadeWith;
  return true;
}

// pdfmake calls the footer for every page with (currentPage, pageCount).
export function footerFunction(ctx) {
  const { theme, labels, pageMargins } = ctx;
  const lines = footerLines(ctx);
  const madeWith = showMadeWith(ctx) ? labels.L('footer.madeWith') : null;
  return (currentPage, pageCount) => ({
    columns: [
      { width: '*', stack: lines.map(text => ({ text, fontSize: theme.small, color: theme.muted })) },
      {
        width: 'auto',
        stack: [
          { text: labels.L('footer.page', { page: currentPage, pages: pageCount }), fontSize: theme.small, color: theme.muted, alignment: 'right' },
          madeWith ? { text: madeWith, fontSize: theme.small - 0.5, color: theme.muted, alignment: 'right', margin: [0, 2, 0, 0] } : null,
          currentPage < pageCount ? { text: labels.L('footer.continues'), fontSize: theme.small - 0.5, color: theme.muted, alignment: 'right', margin: [0, 2, 0, 0] } : null
        ].filter(Boolean)
      }
    ],
    columnGap: 12,
    margin: [pageMargins[0], 16, pageMargins[2], 0]
  });
}
