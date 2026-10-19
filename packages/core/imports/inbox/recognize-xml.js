// Structured e-invoices in the Inbox: UBL, ISDOC and CII. The full parsers
// of other packages are used when they exist (a registered parser first,
// then the core parseUbl / parseIsdoc), otherwise the minimal readers of
// this folder. Every value read from XML is trusted (confidence 1).
import { parseUbl } from '../../ubl/index.js';
import { parseIsdoc } from '../../isdoc/index.js';
import { CoreError } from '../../errors.js';
import { parseXml } from './xml.js';
import { readUbl, readIsdoc } from './xml-ubl.js';
import { readCii } from './xml-cii.js';
import { emptyRecognition, setField, finish } from './result.js';

const parsers = new Map();

/**
 * Lets another package provide a full parser for a format ('UBL', 'ISDOC',
 * 'CII'). parse(xml) returns { document, attachments?, warnings? } with a
 * document in the schema shape. Returns a function that removes it.
 */
export function registerInboxParser(format, parse) {
  parsers.set(format, parse);
  return () => { if (parsers.get(format) === parse) parsers.delete(format); };
}

/** 'UBL' | 'ISDOC' | 'CII' | null for an XML text. */
export function detectXmlFormat(xml) {
  const head = String(xml || '').slice(0, 4000);
  if (!/^\s*(\ufeff)?(<\?xml|<)/.test(head)) return null;
  if (/isdoc\.cz\/namespace/i.test(head)) return 'ISDOC';
  if (/CrossIndustryInvoice/.test(head)) return 'CII';
  if (/urn:oasis:names:specification:ubl:schema:xsd:(Invoice|CreditNote)-2/.test(head)) return 'UBL';
  return null;
}

/** Fields from a document in the schema shape (what parseUbl returns). */
export function fieldsFromDocument(doc) {
  const seller = doc.seller || {};
  const totals = doc.totals || {};
  return {
    kind: doc.kind === 'CREDIT_NOTE' || doc.kind === 'RECEIVED_CREDIT_NOTE' ? 'RECEIVED_CREDIT_NOTE' : 'RECEIVED_INVOICE',
    number: doc.number, issueDate: doc.issueDate, taxDate: doc.taxDate, dueDate: doc.dueDate, currency: doc.currency,
    vs: doc.vs, ks: doc.ks, ss: doc.ss,
    supplierName: seller.name, ico: seller.ico, dic: seller.dic, icDph: seller.icDph, supplierAddress: seller.address || null,
    iban: doc.iban || null,
    net: totals.net, vat: totals.vat, total: totals.payable ?? totals.gross,
    breakdown: (totals.breakdown || []).map(b => ({ category: b.category, rate: b.rate ?? '0', base: b.base, vat: b.vat })),
    lines: (doc.lines || []).filter(l => !l.kind || l.kind === 'ITEM').map(l => ({
      name: l.name, qty: l.qty, unitCode: l.unit?.code || null, unitPrice: l.unitPrice, net: null, vatCategory: l.vatCategory, vatRate: l.vatRate
    }))
  };
}

function readMinimal(format, xml) {
  const root = parseXml(xml);
  if (format === 'ISDOC') return readIsdoc(root);
  if (format === 'CII') return readCii(root);
  return readUbl(root);
}

const CORE_PARSERS = { UBL: parseUbl, ISDOC: parseIsdoc };

function readFields(format, xml, warnings) {
  const external = parsers.get(format) || CORE_PARSERS[format];
  if (external) {
    try {
      const parsed = external(xml);
      warnings.push(...(parsed.warnings || []));
      // The minimal reader still supplies payment details the document
      // shape may not carry (the IBAN of the supplier).
      const fields = fieldsFromDocument(parsed.document);
      const minimal = safeMinimal(format, xml);
      return { ...minimal, ...stripEmpty(fields), attachments: parsed.attachments || minimal.attachments || [] };
    } catch (e) {
      // A strict parser refuses an incomplete invoice; a received one is
      // still read, and the user checks it.
      if (!(e && e.code)) throw e;
      if (e.code !== 'NOT_IMPLEMENTED') warnings.push(`PARSER_FALLBACK: ${e.code}`);
    }
  }
  return readMinimal(format, xml);
}

function safeMinimal(format, xml) {
  try { return readMinimal(format, xml); } catch (e) { return {}; }
}

function stripEmpty(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null && v !== undefined && v !== ''));
}

/** Recognition of a UBL, ISDOC or CII document. */
export function recognizeXml(xml, ctx = {}) {
  const format = detectXmlFormat(xml);
  if (!format) throw new CoreError('INBOX_FORMAT_UNKNOWN', 'Not a supported e-invoice XML');
  const result = emptyRecognition(format);
  const fields = readFields(format, xml, result.warnings);
  const { attachments, ...rest } = fields;
  Object.entries(rest).forEach(([name, value]) => setField(result, name, value, 'xml', 1));
  if (attachments && attachments.length) result.attachments = attachments;
  if (ctx.company && result.fields.ico && ctx.company.ico === result.fields.ico) result.warnings.push('SUPPLIER_IS_OWN_COMPANY');
  return finish(result);
}
