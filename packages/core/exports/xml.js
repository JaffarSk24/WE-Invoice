// A tiny XML writer for the export formats (Pohoda, Money S3, ISDOC). A
// node is { name, attrs, children }; text is escaped once, here, so no
// format module ever concatenates user data into markup. Empty optional
// values are dropped by leaf(), which keeps the output valid against
// schemas that forbid empty elements.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

// Characters XML 1.0 does not allow at all (control characters other than
// tab, line feed and carriage return) are removed rather than escaped.
// eslint-disable-next-line no-control-regex -- the class lists the forbidden control characters on purpose
const FORBIDDEN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g;

export function escapeXml(value) {
  return String(value).replace(FORBIDDEN, '').replace(/[&<>"']/g, ch => ESCAPES[ch]);
}

function isEmpty(value) {
  return value === null || value === undefined || value === '';
}

/** An element. Children may be nodes, strings, numbers, arrays or nulls. */
export function el(name, attrs, ...children) {
  return { name, attrs: attrs || {}, children: children.flat(Infinity).filter(c => !isEmpty(c) && c !== false) };
}

/** An element with a text value, or null when the value is empty. */
export function leaf(name, value, attrs = null) {
  return isEmpty(value) ? null : el(name, attrs, String(value));
}

/** An element that is dropped when it ends up with no children. */
export function group(name, attrs, ...children) {
  const node = el(name, attrs, ...children);
  return node.children.length ? node : null;
}

function attrText(attrs) {
  return Object.entries(attrs)
    .filter(([, v]) => !isEmpty(v))
    .map(([k, v]) => ` ${k}="${escapeXml(v)}"`)
    .join('');
}

function write(node, depth, out) {
  const pad = '  '.repeat(depth);
  if (typeof node !== 'object') {
    out.push(`${pad}${escapeXml(node)}`);
    return;
  }
  const open = `${node.name}${attrText(node.attrs)}`;
  if (!node.children.length) {
    out.push(`${pad}<${open}/>`);
    return;
  }
  if (node.children.every(c => typeof c !== 'object')) {
    out.push(`${pad}<${open}>${node.children.map(escapeXml).join('')}</${node.name}>`);
    return;
  }
  out.push(`${pad}<${open}>`);
  node.children.forEach(child => write(child, depth + 1, out));
  out.push(`${pad}</${node.name}>`);
}

/** Serialises a node tree with an XML declaration, two-space indent, LF. */
export function serializeXml(root, { encoding = 'UTF-8' } = {}) {
  const out = [`<?xml version="1.0" encoding="${encoding}"?>`];
  write(root, 0, out);
  return `${out.join('\n')}\n`;
}
