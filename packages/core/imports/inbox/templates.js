// "Vybrať" and remembered suppliers. The user points at a piece of text on
// the preview and pickFieldValue turns it into the value of the chosen
// field, checked like a recognised one. What the user settled on for a
// supplier (category, payment method, line text and where on the page
// each field sits) is kept as a template on the supplier's contact and
// applied to the next document from the same IČO.
import { classifyId, normalizeId, normalizeIban } from './party.js';
import { findAll, fold, toAmount, toDate, AMOUNT, DATE_VALUE } from './text-scan.js';
import { setField, finish } from './result.js';

const ID_FIELDS = ['ico', 'dic', 'icDph'];
const AMOUNT_FIELDS = ['net', 'vat', 'total'];
const DATE_FIELDS = ['issueDate', 'taxDate', 'dueDate'];
const SYMBOLS = { vs: /\b(\d{1,10})\b/, ss: /\b(\d{1,10})\b/, ks: /\b(\d{4})\b/ };

/**
 * The value of a field from the text the user picked, or null when the
 * text holds no valid value for it.
 */
export function pickFieldValue(field, raw) {
  const text = String(raw ?? '').replace(/[\u00a0\t]/g, ' ').trim();
  if (!text) return null;
  if (ID_FIELDS.includes(field)) {
    const tokens = text.toUpperCase().replace(/\s/g, '').match(/[A-Z]{2}\d{8,12}|\d{6,10}/g) || [];
    for (const token of tokens) if (classifyId(token) === field) return normalizeId(field, token);
    return null;
  }
  if (field === 'iban') {
    const compact = text.toUpperCase().replace(/\s/g, '');
    const m = compact.match(/[A-Z]{2}\d{2}[A-Z0-9]{11,30}/);
    return m ? normalizeIban(m[0]) : null;
  }
  if (field === 'bic') {
    const m = text.toUpperCase().match(/\b[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/);
    return m ? m[0] : null;
  }
  if (AMOUNT_FIELDS.includes(field)) {
    const hit = findAll(fold(text), AMOUNT)[0];
    return hit ? toAmount(text.slice(hit.index, hit.end)) : null;
  }
  if (DATE_FIELDS.includes(field)) {
    const hit = findAll(text, DATE_VALUE)[0];
    return hit ? toDate(hit.groups[0]) : null;
  }
  if (SYMBOLS[field]) {
    const m = text.match(SYMBOLS[field]);
    return m ? m[1] : null;
  }
  if (field === 'currency') {
    const m = text.toUpperCase().match(/\b[A-Z]{3}\b|€/);
    return m ? (m[0] === '€' ? 'EUR' : m[0]) : null;
  }
  if (field === 'number') return text.replace(/^.*?(?:c\.|č\.|no\.|nr\.|#|:)\s*/i, '').split(/\s{2,}/)[0].slice(0, 60) || null;
  return text.slice(0, 200);
}

/** The recognition with a value the user picked or typed (trusted). */
export function applyUserValue(recognition, field, value) {
  const out = { ...recognition, fields: { ...recognition.fields }, sources: { ...recognition.sources }, fieldConfidence: { ...recognition.fieldConfidence } };
  delete out.fieldConfidence[field];
  setField(out, field, value, 'user', 1);
  return finish(out);
}

/**
 * The template after another document of the supplier: what the user
 * chose wins, the rest stays. regions: { field: {page, x, y, w, h} } in
 * page fractions (0..1), as picked with "Vybrať".
 */
export function learnTemplate(previous, { category, paymentMethod, lineName, regions } = {}) {
  const base = previous || { category: null, paymentMethod: null, lineName: null, regions: {}, uses: 0 };
  return {
    category: category ?? base.category ?? null,
    paymentMethod: paymentMethod ?? base.paymentMethod ?? null,
    lineName: lineName ?? base.lineName ?? null,
    regions: { ...(base.regions || {}), ...(regions || {}) },
    uses: (base.uses || 0) + 1
  };
}

/**
 * Fills fields from the remembered regions of a template. readRegion
 * (region) returns the text inside the region of the current document.
 */
export function applyTemplateRegions(recognition, template, readRegion) {
  if (!template || !template.regions) return recognition;
  for (const [field, region] of Object.entries(template.regions)) {
    const value = pickFieldValue(field, readRegion(region));
    if (value !== null) setField(recognition, field, value, 'template', 0.9);
  }
  return finish(recognition);
}

const compact = (v) => String(v ?? '').replace(/\s/g, '').toUpperCase();

/** The supplier contact of recognised fields: by IČO, IČ DPH, IBAN, then exact name. */
export function findSupplierContact(contacts, fields) {
  const live = (contacts || []).filter(c => c && !c.deleted);
  const by = (pred) => live.find(pred) || null;
  if (fields.ico) {
    const hit = by(c => c.ico && compact(c.ico).padStart(8, '0') === compact(fields.ico).padStart(8, '0'));
    if (hit) return hit;
  }
  if (fields.icDph) {
    const hit = by(c => c.icDph && compact(c.icDph) === compact(fields.icDph));
    if (hit) return hit;
  }
  if (fields.iban) {
    const hit = by(c => c.iban && compact(c.iban) === compact(fields.iban));
    if (hit) return hit;
  }
  if (fields.supplierName) return by(c => c.name && c.name.trim().toLowerCase() === fields.supplierName.trim().toLowerCase());
  return null;
}
