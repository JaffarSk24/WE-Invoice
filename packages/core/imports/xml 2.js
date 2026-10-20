// A small, strict-enough XML reader for the import formats (Pohoda,
// ISDOC, Money S3, XLSX parts). No DOM is available in the core, so this
// reads elements, attributes, text, CDATA and the predefined and numeric
// entities, and skips comments, processing instructions and DOCTYPE.
// External entities are never resolved (no XXE). Names keep their prefix
// in `qname`; `name` is the local part, which is what the importers match,
// because each program uses its own prefixes for the same namespace.
import { CoreError } from '../errors.js';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, ref) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[ref] ?? whole;
  });
}

function bad(message) {
  return new CoreError('IMPORT_XML_INVALID', message);
}

const ATTR = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;

function makeNode(qname, attrText) {
  const attrs = {};
  let m;
  ATTR.lastIndex = 0;
  while ((m = ATTR.exec(attrText))) attrs[m[1]] = decodeEntities(m[3] ?? m[4]);
  const colon = qname.indexOf(':');
  return { qname, name: colon >= 0 ? qname.slice(colon + 1) : qname, attrs, children: [], text: '' };
}

/** Parses XML text into { name, qname, attrs, children, text }. */
export function parseXml(input) {
  const src = String(input || '').replace(/^\ufeff/, '');
  const stack = [];
  let root = null;
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    const textEnd = lt < 0 ? src.length : lt;
    if (textEnd > i && stack.length) stack[stack.length - 1].text += decodeEntities(src.slice(i, textEnd));
    if (lt < 0) break;
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      if (end < 0) throw bad('unclosed comment');
      i = end + 3;
    } else if (src.startsWith('<![CDATA[', lt)) {
      const end = src.indexOf(']]>', lt + 9);
      if (end < 0) throw bad('unclosed CDATA');
      if (stack.length) stack[stack.length - 1].text += src.slice(lt + 9, end);
      i = end + 3;
    } else if (src.startsWith('<?', lt)) {
      const end = src.indexOf('?>', lt + 2);
      if (end < 0) throw bad('unclosed processing instruction');
      i = end + 2;
    } else if (src.startsWith('<!', lt)) {
      // DOCTYPE, possibly with an internal subset in brackets.
      let depth = 0;
      let j = lt + 2;
      for (; j < src.length; j++) {
        if (src[j] === '[') depth++;
        else if (src[j] === ']') depth--;
        else if (src[j] === '>' && depth <= 0) break;
      }
      i = j + 1;
    } else if (src[lt + 1] === '/') {
      const end = src.indexOf('>', lt);
      if (end < 0) throw bad('unclosed end tag');
      const qname = src.slice(lt + 2, end).trim();
      const node = stack.pop();
      if (!node || node.qname !== qname) throw bad(`mismatched end tag ${qname}`);
      i = end + 1;
    } else {
      let end = lt + 1;
      let quote = null;
      for (; end < src.length; end++) {
        const ch = src[end];
        if (quote) { if (ch === quote) quote = null; } else if (ch === '"' || ch === "'") quote = ch;
        else if (ch === '>') break;
      }
      if (end >= src.length) throw bad('unclosed start tag');
      const selfClosing = src[end - 1] === '/';
      const inner = src.slice(lt + 1, selfClosing ? end - 1 : end);
      const nameEnd = inner.search(/[\s]/);
      const qname = nameEnd < 0 ? inner : inner.slice(0, nameEnd);
      if (!qname) throw bad('empty tag name');
      const node = makeNode(qname, nameEnd < 0 ? '' : inner.slice(nameEnd));
      if (stack.length) stack[stack.length - 1].children.push(node);
      else if (root) throw bad('more than one root element');
      else root = node;
      if (!selfClosing) stack.push(node);
      i = end + 1;
    }
  }
  if (stack.length) throw bad(`unclosed element ${stack[stack.length - 1].qname}`);
  if (!root) throw bad('no root element');
  return root;
}

/** First child with a local name, or null. */
export function child(node, name) {
  return (node && node.children.find(c => c.name === name)) || null;
}

/** All children with a local name. */
export function children(node, name) {
  return node ? node.children.filter(c => c.name === name) : [];
}

/** Node at a path of local names ("invoiceHeader/number/numberRequested"). */
export function at(node, path) {
  return path.split('/').reduce((n, part) => (n ? child(n, part) : null), node);
}

/** Trimmed text at a path, or null when the element is missing or empty. */
export function textAt(node, path) {
  const n = path ? at(node, path) : node;
  const t = n ? n.text.trim() : '';
  return t === '' ? null : t;
}

/** Every descendant with a local name, in document order. */
export function descendants(node, name, out = []) {
  if (!node) return out;
  for (const c of node.children) {
    if (c.name === name) out.push(c);
    descendants(c, name, out);
  }
  return out;
}
