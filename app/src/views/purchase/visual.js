// What a received e-invoice looks like on paper. An eFaktúra (or an XML
// put into the Inbox) is data without a picture: the supplier's own PDF,
// when the XML carries one, is shown as it is; otherwise the app prints
// the document with its own PDF engine, the supplier in the seller's
// place, the payment QR (PAY by square, QR Platba) built from the
// supplier's account in the XML, in the company's document language and
// without anything of the user's company (logo, footer texts).
const PRINTED_KIND = { RECEIVED_INVOICE: 'INVOICE', RECEIVED_CREDIT_NOTE: 'CREDIT_NOTE', EXPENSE_RECEIPT: 'INVOICE' };

/**
 * The supplier's account of a received document: the one typed or
 * confirmed, else the one of the XML, else the one known for the supplier
 * (its contact card or an earlier document of it).
 */
export function payeeAccount(doc, known = null) {
  const account = (doc.payee && doc.payee.iban ? doc.payee : null) || (doc.paymentAccount && doc.paymentAccount.iban ? doc.paymentAccount : null)
    || (known && known.iban ? known : null);
  return account ? { iban: String(account.iban).replace(/\s/g, '').toUpperCase(), bic: account.bic || null } : null;
}

/**
 * The document and the "company" to print a received document with.
 * @returns {{document: object, company: object}}
 */
export function printableReceived(doc, company, known = null) {
  const seller = doc.seller || {};
  const account = payeeAccount(doc, known);
  const currency = doc.currency || 'EUR';
  return {
    document: {
      ...doc,
      kind: PRINTED_KIND[doc.kind] || 'INVOICE',
      status: 'ISSUED',
      bankAccountId: account ? 'payee' : null,
      paymentMethod: doc.paymentMethod || 'TRANSFER',
      buyer: doc.buyer || (company ? { name: company.name, ico: company.ico, dic: company.dic, icDph: company.icDph, address: company.address } : null)
    },
    company: {
      name: seller.name || '', ico: seller.ico || null, dic: seller.dic || null, icDph: seller.icDph || null,
      address: seller.address || null, registerEntry: seller.registerEntry || null, email: seller.email || null, phone: seller.phone || null,
      vatMode: seller.vatPayer === false ? 'NONPAYER' : 'PAYER',
      bankAccounts: account ? [{ id: 'payee', iban: account.iban, bic: account.bic, currency, isDefault: true }] : [],
      defaults: { language: (company && company.defaults && company.defaults.language) || 'sk', template: 'CLASSIC', showMadeWith: false }
    }
  };
}

/** The account known for the supplier of a document: its contact card, else its latest document with one. */
export function knownSupplierAccount(doc, contacts = [], documents = []) {
  const contact = doc.contactId ? contacts.find(c => c.id === doc.contactId) : null;
  if (contact && contact.iban) return { iban: contact.iban, bic: contact.bic || null };
  const earlier = documents
    .filter(d => d.id !== doc.id && !d.deleted && d.contactId && d.contactId === doc.contactId && d.payee && d.payee.iban)
    .sort((a, b) => String(b.issueDate || '').localeCompare(String(a.issueDate || '')))[0];
  return earlier ? { iban: earlier.payee.iban, bic: earlier.payee.bic || null } : null;
}

/** Canvases of the pages of PDF bytes: [{ canvas, items: [] }]. */
export async function pdfCanvases(bytes, { openPdf, width, max }) {
  const pdf = await openPdf(bytes);
  try {
    const out = [];
    for (let n = 1; n <= Math.min(pdf.numPages, max); n++) {
      const canvas = document.createElement('canvas');
      await pdf.renderPage(n, canvas, width);
      out.push({ canvas, items: [] });
    }
    return out;
  } finally {
    await pdf.destroy();
  }
}

/**
 * Pages of a received e-invoice: the supplier's PDF attachment when one can
 * be read (readAttachment), else the document printed by the app.
 * @returns {Promise<{pages: object[], source: 'ATTACHMENT'|'PRINTED'}>}
 */
export async function receivedVisual(doc, company, { readAttachment = null, buildPdf, openPdf, width, max, known = null }) {
  const attachment = (doc.attachments || []).find(a => /pdf/i.test(a.mime || '') || /\.pdf$/i.test(a.name || ''));
  if (attachment && readAttachment) {
    try {
      const bytes = await readAttachment(attachment);
      if (bytes && bytes.length) return { pages: await pdfCanvases(bytes, { openPdf, width, max }), source: 'ATTACHMENT' };
    } catch (e) {
      console.warn('The PDF of the e-invoice could not be read; printing it instead', e);
    }
  }
  const printable = printableReceived(doc, company, known);
  const blob = await buildPdf(printable.document, printable.company, { allowIncomplete: true });
  return { pages: await pdfCanvases(new Uint8Array(await blob.arrayBuffer()), { openPdf, width, max }), source: 'PRINTED' };
}
