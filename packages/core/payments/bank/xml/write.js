// Writing XML as text: escaping and a tiny element builder. Children that
// are null or undefined are left out, so optional elements read naturally
// at the call site: el('CdtrAgt', bic ? ... : null).

export function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * An element as an array of lines. `content` is a string (text) or a list
 * of children (each an array of lines, or null).
 */
export function el(name, content, attrs = null) {
  const attrText = attrs ? Object.entries(attrs).map(([k, v]) => ` ${k}="${escapeXml(v)}"`).join('') : '';
  if (content === null || content === undefined) return null;
  if (!Array.isArray(content)) return [`<${name}${attrText}>${escapeXml(content)}</${name}>`];
  const children = content.filter(Boolean).flat();
  return [`<${name}${attrText}>`, ...children.map(line => `  ${line}`), `</${name}>`];
}

/** A document with the XML declaration. */
export function xmlDocument(root) {
  return ['<?xml version="1.0" encoding="UTF-8"?>', ...root].join('\n') + '\n';
}
