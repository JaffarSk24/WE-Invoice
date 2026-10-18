// Builds the pdfmake docDefinition of a document: a pure function of the
// document, the company and the options, so the snapshot tests compare
// structure and text, never bytes. The template decides the look, the
// blocks decide the content, the labels the language.
//
// options = { template, language, secondLanguage, brandColor, images:
//   { logo, signature, stamp } (data URLs), bankAccount, issuedBy,
//   showMadeWith, linkedNumbers: { docId: number }, qr: false to skip,
//   attachments: [{ name, data, mime, description, relationship }],
//   pdfa: true for PDF/A-3b even without attachments }
import { templateById } from './templates/index.js';
import { printLabels } from './labels.js';
import { formatters } from './format.js';
import { buildTheme } from './theme.js';
import { linesWithAmounts, amountDue, paidAmount, isZero } from './amounts.js';
import { legalNotes, isVatPayer } from './legal.js';
import { bankAccountFor, documentQr, QR_KINDS } from './qr.js';
import { runningHead, titleText } from './blocks/header.js';
import { partiesBlock } from './blocks/parties.js';
import { metaBlock } from './blocks/meta.js';
import { linesBlock } from './blocks/lines.js';
import { totalsBlock } from './blocks/totals.js';
import { paymentBlock } from './blocks/payment.js';
import { introBlock, legalBlock, outroBlock, signatureBlock } from './blocks/texts.js';
import { footerFunction } from './blocks/footer.js';
import { toBase64 } from './fonts.js';

export const FONT_NAME = 'Inter';
const IMAGE_KEYS = ['logo', 'signature', 'stamp'];
const PAYABLE_ROW_KINDS = new Set([...QR_KINDS, 'SELF_BILLING', 'CREDIT_NOTE']);

function pickImages(images) {
  const out = {};
  IMAGE_KEYS.forEach(key => { if (images && typeof images[key] === 'string' && images[key].startsWith('data:image/')) out[key] = images[key]; });
  return out;
}

function defaultsOf(company) {
  return (company && company.defaults) || {};
}

/** The resolved print settings of a document (also used for the file name). */
export function printSettings(document, company, options = {}) {
  const defaults = defaultsOf(company);
  const language = options.language || document.language || defaults.language || 'sk';
  const secondLanguage = options.secondLanguage !== undefined ? options.secondLanguage : (document.secondLanguage ?? defaults.secondLanguage ?? null);
  const template = templateById(options.template || document.template || defaults.template);
  return { language, secondLanguage, template, labels: printLabels(language, secondLanguage) };
}

export function buildContext(document, company, options = {}) {
  const { language, secondLanguage, template, labels } = printSettings(document, company, options);
  const theme = buildTheme(options.brandColor ?? defaultsOf(company).brandColor, template);
  const vatPayer = isVatPayer(document, company);
  const due = amountDue(document);
  const paid = paidAmount(document);
  const totals = document.totals || {};
  const payableShown = PAYABLE_ROW_KINDS.has(document.kind);
  const paidInFull = QR_KINDS.has(document.kind) && isZero(due) && !isZero(totals.payable);
  const bank = bankAccountFor(document, company, options.bankAccount);
  const ctx = {
    doc: document, company: company || {}, options, template, labels, fmt: formatters(language), theme,
    language, secondLanguage, vatPayer, due, paid, payableShown, paidInFull, bank,
    lines: linesWithAmounts(document.lines, vatPayer),
    images: pickImages(options.images),
    pageMargins: template.pageMargins
  };
  ctx.legal = legalNotes(document, company, labels);
  ctx.qr = paidInFull ? null : documentQr(document, bank, due, { ...options, noteLabel: labels.one(`title.${document.kind}`) });
  return ctx;
}

function attachmentFiles(options) {
  const list = options.attachments || [];
  if (!list.length) return null;
  const files = {};
  list.forEach((a, i) => {
    const name = a.name || `attachment-${i + 1}`;
    const bytes = typeof a.data === 'string' ? new TextEncoder().encode(a.data) : new Uint8Array(a.data);
    const mime = a.mime || 'application/octet-stream';
    // pdfmake resolves a string src only: a data URL carries the bytes.
    files[name] = { src: `data:${mime};base64,${toBase64(bytes)}`, name, type: mime, description: a.description || name, relationship: a.relationship || 'Alternative' };
  });
  return files;
}

export function buildDocDefinition(document, company, options = {}) {
  const ctx = buildContext(document, company, options);
  const { theme, template } = ctx;
  const content = [
    template.header(ctx),
    partiesBlock(ctx),
    metaBlock(ctx),
    introBlock(ctx),
    linesBlock(ctx),
    totalsBlock(ctx),
    legalBlock(ctx),
    paymentBlock(ctx),
    outroBlock(ctx),
    signatureBlock(ctx)
  ].filter(Boolean);
  const title = titleText(ctx);
  const definition = {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: template.pageMargins,
    defaultStyle: { font: FONT_NAME, fontSize: theme.fontSize, color: theme.text, lineHeight: 1.15 },
    styles: { lineDescription: { fontSize: theme.small, color: theme.muted } },
    info: { title, author: document.seller ? document.seller.name : '', subject: title, creator: 'WE Invoice', producer: 'WE Invoice' },
    header: runningHead(ctx),
    footer: footerFunction(ctx),
    images: ctx.images,
    content
  };
  const files = attachmentFiles(options);
  if (files || options.pdfa) {
    definition.version = '1.7';
    definition.subset = 'PDF/A-3b';
    definition.displayTitle = true;
    if (files) definition.files = files;
  }
  return definition;
}
