// A tiny XML writer for UBL: documents are built as plain node objects and
// serialised to text with escaping, so the core needs no DOM. Empty values
// and empty elements are dropped on purpose (Peppol rule R008 forbids empty
// elements), which lets the builder describe optional fields without ifs.

/** Escapes text for element content and attribute values. */
export function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Control characters other than tab, line feed and carriage return are not allowed in XML 1.0.
    // eslint-disable-next-line no-control-regex -- removing them is the point
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}

function filled(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function cleanAttrs(attrs) {
  if (!attrs) return null;
  const out = {};
  for (const [key, value] of Object.entries(attrs)) if (filled(value)) out[key] = String(value);
  return Object.keys(out).length ? out : null;
}

/**
 * Element with a text value; null when the value is empty.
 * @param {string} name  qualified name, e.g. "cbc:ID"
 * @param {*} value
 * @param {object} [attrs]
 */
export function leaf(name, value, attrs) {
  if (!filled(value)) return null;
  return { name, attrs: cleanAttrs(attrs), text: String(value) };
}

/**
 * Element with child elements; null when no child is left.
 * @param {string} name
 * @param {Array<object|null|Array>} children  nulls and nested arrays are flattened away
 * @param {object} [attrs]
 */
export function node(name, children, attrs) {
  const list = children.flat(Infinity).filter(Boolean);
  if (!list.length) return null;
  return { name, attrs: cleanAttrs(attrs), children: list };
}

function attrText(attrs) {
  if (!attrs) return '';
  return Object.entries(attrs).map(([k, v]) => ` ${k}="${escapeXml(v)}"`).join('');
}

function write(el, depth, out) {
  const pad = '  '.repeat(depth);
  if (el.text !== undefined) {
    out.push(`${pad}<${el.name}${attrText(el.attrs)}>${escapeXml(el.text)}</${el.name}>`);
    return;
  }
  out.push(`${pad}<${el.name}${attrText(el.attrs)}>`);
  for (const child of el.children) write(child, depth + 1, out);
  out.push(`${pad}</${el.name}>`);
}

/** Serialises a node tree with an XML declaration and two-space indentation. */
export function serialize(root) {
  const out = ['<?xml version="1.0" encoding="UTF-8"?>'];
  write(root, 0, out);
  return `${out.join('\n')}\n`;
}
