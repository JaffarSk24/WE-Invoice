// A minimal XML writer for the tax reports: elements with attributes and
// text, escaped, indented by two spaces, UTF-8 declaration on top. The
// reports are small and flat, so a tree of plain objects is enough and no
// dependency is needed.
//   el('A1', { Odb: 'SK2020123457', Z: '100.00' })
//   el('Rok', {}, '2026')
//   el('Obdobie', {}, el('Rok', {}, '2026'), el('Mesiac', {}, '7'))

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

export function escapeXml(value) {
  // Control characters other than tab, line feed and carriage return are
  // not allowed in XML 1.0 and are dropped.
  // eslint-disable-next-line no-control-regex
  return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"']/g, c => ESCAPES[c]);
}

/**
 * @param {string} name
 * @param {Object<string, string|number|null|undefined>} [attrs]  null and undefined are left out
 * @param {...(object|string|number|null)} children
 */
export function el(name, attrs = {}, ...children) {
  return { name, attrs: attrs || {}, children: children.flat().filter(c => c !== null && c !== undefined && c !== false) };
}

function attrText(attrs) {
  return Object.entries(attrs)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => ` ${k}="${escapeXml(v)}"`).join('');
}

function render(node, depth, out) {
  const pad = '  '.repeat(depth);
  if (typeof node !== 'object') {
    out.push(`${pad}${escapeXml(node)}`);
    return;
  }
  const open = `${pad}<${node.name}${attrText(node.attrs)}`;
  if (!node.children.length) {
    out.push(`${open}/>`);
    return;
  }
  if (node.children.length === 1 && typeof node.children[0] !== 'object') {
    out.push(`${open}>${escapeXml(node.children[0])}</${node.name}>`);
    return;
  }
  out.push(`${open}>`);
  node.children.forEach(child => render(child, depth + 1, out));
  out.push(`${pad}</${node.name}>`);
}

/** The document as text with the XML declaration and a final new line. */
export function toXml(root) {
  const out = ['<?xml version="1.0" encoding="UTF-8"?>'];
  render(root, 0, out);
  return `${out.join('\n')}\n`;
}
