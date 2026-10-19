// The shape every Inbox recogniser returns, and how results are combined.
// A recognition holds the fields it found, where each came from and how
// sure it is (0..1). Structured sources (XML, QR, eKasa) are trusted;
// anything read from text or a picture needs the user's confirmation
// (03-features.md § 3.11 AC).
//
//   { format, fields: {name: value}, sources: {name: source},
//     fieldConfidence: {name: 0..1}, confidence, needsConfirmation,
//     warnings: string[], attachments?: object[] }

export const SOURCES = Object.freeze(['xml', 'qr', 'ekasa', 'text', 'ocr', 'template', 'user']);
export const STRUCTURED_SOURCES = Object.freeze(['xml', 'qr', 'ekasa', 'user']);

// Fields the user checks before a document is saved; the overall
// confidence is their mean.
export const KEY_FIELDS = Object.freeze(['ico', 'number', 'issueDate', 'total', 'currency']);

// The recognisable fields, in the order the review form shows them.
export const FIELDS = Object.freeze([
  'supplierName', 'ico', 'dic', 'icDph', 'number', 'vs', 'ks', 'ss', 'issueDate', 'taxDate', 'dueDate',
  'currency', 'net', 'vat', 'total', 'iban', 'bic'
]);

export function emptyRecognition(format) {
  return { format, fields: {}, sources: {}, fieldConfidence: {}, confidence: 0, needsConfirmation: true, warnings: [] };
}

const present = (value) => value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && !value.length);

/** Sets a field unless an equally or more confident value is there already. */
export function setField(result, name, value, source, confidence) {
  if (!present(value)) return result;
  const current = result.fieldConfidence[name];
  if (current !== undefined && current >= confidence) return result;
  result.fields[name] = value;
  result.sources[name] = source;
  result.fieldConfidence[name] = confidence;
  return result;
}

/** Recomputes the overall confidence and whether the user has to confirm. */
export function finish(result) {
  const scores = KEY_FIELDS.map(k => result.fieldConfidence[k] || 0);
  result.confidence = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100;
  const keySources = KEY_FIELDS.filter(k => present(result.fields[k])).map(k => result.sources[k]);
  const structured = keySources.length > 0 && keySources.every(s => STRUCTURED_SOURCES.includes(s));
  result.needsConfirmation = !structured || KEY_FIELDS.some(k => !present(result.fields[k]) && k !== 'ico');
  return result;
}

/**
 * Combines recognitions of one file (a QR code and the text layer, say):
 * every field keeps its most confident value. The format is the first
 * structured one, else the first.
 */
export function mergeRecognitions(...results) {
  const list = results.filter(Boolean);
  if (!list.length) return finish(emptyRecognition('NONE'));
  const structured = list.find(r => ['UBL', 'ISDOC', 'CII', 'EKASA'].includes(r.format));
  const out = emptyRecognition((structured || list[0]).format);
  for (const r of list) {
    Object.keys(r.fields).forEach(name => setField(out, name, r.fields[name], r.sources[name], r.fieldConfidence[name] ?? 0));
    out.warnings.push(...(r.warnings || []));
    if (r.attachments) out.attachments = [...(out.attachments || []), ...r.attachments];
    if (r.receipt) out.receipt = r.receipt;
  }
  return finish(out);
}
