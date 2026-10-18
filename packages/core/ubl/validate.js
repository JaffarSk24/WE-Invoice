// Local checks of a document before it goes to a Peppol provider: the
// Slovak rules of sk-rules.json and the EN 16931 / Peppol rules that a
// small business most often trips over. Fast and offline; the provider's
// own validation and the official Schematron in CI come on top of it.
import { isZero, isNegative } from '../money/index.js';
import { isTaxDocument } from '../documents/kinds.js';
import skRules from './sk-rules.json' with { type: 'json' };
import { ublModel } from './model.js';
import { isDic } from './parties.js';

const RULES = new Map(skRules.rules.map(r => [r.code, r]));

function issue(code, field) {
  const rule = RULES.get(code);
  return { rule: rule.id, code, bt: rule.bt, severity: rule.severity, field: field || null };
}

const VAT_ID_CATEGORIES = ['S', 'AE', 'K'];

/** Rules that need the document itself, before any model can be built. */
function documentIssues(document) {
  const out = [];
  if (document.classified) out.push(issue('CLASSIFIED_SUPPLY', 'classified'));
  if (!isTaxDocument(document.kind) || !skRules.typeCodes.byKind[document.kind]) out.push(issue('TYPE_CODE_NOT_ALLOWED', 'kind'));
  if (!document.number) out.push(issue('NUMBER_MISSING', 'number'));
  if (!document.issueDate) out.push(issue('ISSUE_DATE_MISSING', 'issueDate'));
  if (!(document.lines || []).some(l => !l.kind || l.kind === 'ITEM')) out.push(issue('NO_LINES', 'lines'));
  return out;
}

function modelIssues(m, document) {
  const out = [];
  if (!m.sellerEndpoint || !isDic(m.seller.dic)) out.push(issue('SELLER_DIC_MISSING', 'seller.dic'));
  if (!m.buyerEndpoint) out.push(issue('BUYER_ENDPOINT_MISSING', 'buyer.dic'));
  if (m.categories.has('O') && m.categories.size > 1) out.push(issue('NOT_SUBJECT_MIXED', 'lines'));
  if ([...m.categories].some(c => VAT_ID_CATEGORIES.includes(c)) && !m.seller.icDph) out.push(issue('SELLER_VAT_ID_MISSING', 'seller.icDph'));
  if ((m.categories.has('AE') || m.categories.has('K')) && !m.buyer.icDph) out.push(issue('BUYER_VAT_ID_MISSING', 'buyer.icDph'));
  if (!m.seller.registerEntry) out.push(issue('SELLER_REGISTER_ENTRY_MISSING', 'seller.registerEntry'));
  if ((m.creditNote || document.kind === 'DEBIT_NOTE') && !m.preceding.length) out.push(issue('PRECEDING_INVOICE_MISSING', 'links'));
  if (m.currency !== 'EUR' && m.totals.vatEur === null) out.push(issue('FX_RATE_MISSING', 'fxRate'));
  if (!isZero(m.totals.payable) && !isNegative(m.totals.payable) && !document.dueDate) out.push(issue('DUE_DATE_MISSING', 'dueDate'));
  if (m.defaultedReasons.length) out.push(issue('EXEMPTION_REASON_DEFAULTED', 'lines'));
  if (m.pdfTooLarge) out.push(issue('ATTACHMENT_TOO_LARGE', 'attachments'));
  const forbidden = (document.lines || []).some(l => skRules.exemptionReasonForbidden.includes(l.vatCategory) && (l.exemptionReasonCode || l.exemptionReasonText));
  if (forbidden) out.push(issue('EXEMPTION_REASON_FORBIDDEN', 'lines'));
  return out;
}

/**
 * Local checks before sending (SK rules, required BTs).
 * @param {object} document
 * @param {object} [company]
 * @param {object} [options]  as for buildUbl
 * @returns {Array<{rule: string, code: string, bt: string, severity: 'error'|'warning', field: string|null}>}
 *   code is translated by the interface as peppol.issue.<code>
 */
export function validateUblLocal(document, company = {}, options = {}) {
  const out = documentIssues(document);
  if (out.some(i => i.code === 'TYPE_CODE_NOT_ALLOWED' || i.code === 'NO_LINES')) return out;
  return [...out, ...modelIssues(ublModel(document, company, options), document)];
}

/** True when no issue blocks sending. */
export function hasBlockingIssues(issues) {
  return issues.some(i => i.severity === 'error');
}
