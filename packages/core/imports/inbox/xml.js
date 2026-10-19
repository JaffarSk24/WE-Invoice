// A small non-validating XML reader for the Inbox: enough to read UBL,
// ISDOC and CII invoices in the core, where there is no DOMParser. It
// keeps elements, attributes and text, drops comments, processing
// instructions and the doctype, and strips namespace prefixes so the
// mappings can ask for local names ("Invoice", "ID").
import { CoreError } from '../../errors.js';

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

export function decodeEntities(text) {
  return String(text).replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, name) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name] ?? whole;
  });
}

const localName = (name) => name.slice(name.indexOf(':') + 1);

function parseAttributes(source) {
  const attrs = {};
  const re = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(source))) attrs[localName(m[1])] = decodeEntities(m[3] ?? m[4]);
  return attrs;
}

/**
 * Parses XML text into { name, ns, attrs, children, text } nodes.
 * @returns {{name: string, attrs: object, children: object[], text: string}} the root element
 */
export function parseXml(xml) {
  const src = String(xml || '').replace(/^\ufeff/, '');
  const root = { name: '#document', attrs: {}, children: [], text: '' };
  const stack = [root];
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { stack[stack.length - 1].text += decodeEntities(src.slice(i)); break; }
    if (lt > i) stack[stack.length - 1].text += decodeEntities(src.slice(i, lt));
    if (src.startsWith('<!--', lt)) { i = end(src, '-->', lt) + 3; continue; }
    if (src.startsWith('<![CDATA[', lt)) {
      const close = end(src, ']]>', lt);
      stack[stack.length - 1].text += src.slice(lt + 9, close);
      i = close + 3;
      continue;
    }
    if (src.startsWith('<?', lt)) { i = end(src, '?>', lt) + 2; continue; }
    if (src.startsWith('<!', lt)) { i = end(src, '>', lt) + 1; continue; }
    const gt = end(src, '>', lt);
    const body = src.slice(lt + 1, gt);
    if (body.startsWith('/')) {
      const name = localName(body.slice(1).trim());
      const open = stack.pop();
      if (!open || open.name !== name || !stack.length) throw new CoreError('XML_INVALID', `Unexpected closing tag ${name}`);
    } else {
      const selfClosing = body.endsWith('/');
      const inner = selfClosing ? body.slice(0, -1) : body;
      const nameEnd = inner.search(/\s|$/);
      const node = { name: localName(inner.slice(0, nameEnd)), attrs: parseAttributes(inner.slice(nameEnd)), children: [], text: '' };
      stack[stack.length - 1].children.push(node);
      if (!selfClosing) stack.push(node);
    }
    i = gt + 1;
  }
  if (stack.length !== 1) throw new CoreError('XML_INVALID', `Unclosed element ${stack[stack.length - 1].name}`);
  const top = root.children[0];
  if (!top) throw new CoreError('XML_INVALID', 'No root element');
  return top;
}

function end(src, token, from) {
  const at = src.indexOf(token, from);
  if (at < 0) throw new CoreError('XML_INVALID', `Missing ${token}`);
  return at;
}

/** The first child element with a local name. */
export function child(node, name) {
  return node ? node.children.find(c => c.name === name) || null : null;
}

export function children(node, name) {
  return node ? node.children.filter(c => c.name === name) : [];
}

/** The node at a path of local names ("AccountingSupplierParty/Party/PartyName/Name"). */
export function at(node, path) {
  return path.split('/').reduce((n, part) => child(n, part), node);
}

/** Trimmed text at a path, or null when the element is missing or empty. */
export function textAt(node, path) {
  const n = path ? at(node, path) : node;
  const s = n ? n.text.trim() : '';
  return s || null;
}
