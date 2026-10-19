// The options a document PDF is built with from the company record: the
// logo, signature and stamp kept as data URLs, the numbers of linked
// documents (the invoice a credit note corrects, the deducted advances)
// and the "Vystavené vo WE Invoice" switch.

export function pdfOptions(doc, company, documents = []) {
  const images = {};
  if (company && company.logoDataUrl) images.logo = company.logoDataUrl;
  if (company && company.signatureDataUrl) images.signature = company.signatureDataUrl;
  if (company && company.stampDataUrl) images.stamp = company.stampDataUrl;
  const linkedNumbers = {};
  (doc.links || []).forEach(link => {
    const linked = documents.find(d => d.id === link.docId);
    if (linked && linked.number) linkedNumbers[link.docId] = linked.number;
  });
  const showMadeWith = !(company && company.defaults && company.defaults.showMadeWith === false);
  return { images, linkedNumbers, showMadeWith };
}
