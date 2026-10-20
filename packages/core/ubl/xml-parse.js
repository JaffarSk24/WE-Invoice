// A small XML parser for received UBL documents, without dependencies and
// without a DOM. It reads elements, attributes, text, CDATA and the
// predefined and numeric entities, and skips comments and processing
// instructions. A DOCTYPE is refused outright: e-invoices never need one
// and refusing it rules out entity expansion attacks. Element names are
// kept with their prefix and also exposed as local names, because senders
// choose their own namespace prefixes.
import { CoreError } from '../errors.js';

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function fail(message, pos) {
  throw new CoreError('UBL_XML_INVALID', `${message} at offset ${pos}`, { offset: pos });
}

// The characters XML 1.0 allows (production Char). A reference to any other,
// such as &#0; or a lone surrogate, would pass into the exports for the
// accountant and make their XML invalid, so the document is refused here.
function isXmlChar(code) {
  return code === 0x9 || code === 0xa || code === 0xd || (code >= 0x20 && code <= 0xd7ff)
    || (code >= 0xe000 && code <= 0xfffd) || (code >= 0x10000 && code <= 0x10ffff);
}

function decode(text, pos) {
  if (!text.includes('&')) return text;
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (match, ref) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      if (!Number.isFinite(code) || !isXmlChar(code)) fail(`bad character reference ${match}`, pos);
      return String.fromCodePoint(code);
    }
    if (!(ref in ENTITIES)) fail(`unknown entity ${match}`, pos);
    return ENTITIES[ref];
  });
}

// End of a start tag: the first ">" outside a quoted attribute value.
function tagEnd(src, pos) {
  let quote = null;
  for (let i = pos + 1; i < src.length; i++) {
    const c = src[i];
    if (quote) { if (c === quote) quote = null; } else if (c === '"' || c === "'") quote = c;
    else if (c === '>') return i;
  }
  return -1;
}

const localName = (qname) => qname.slice(qname.indexOf(':') + 1);

function parseAttrs(source, pos) {
  const attrs = {};
  const re = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let match;
  let consumed = 0;
  while ((match = re.exec(source))) {
    if (source.slice(consumed, match.index).trim()) fail('malformed attribute', pos);
    attrs[localName(match[1])] = decode(match[3] ?? match[4], pos);
    consumed = re.lastIndex;
  }
  if (source.slice(consumed).trim()) fail('malformed attribute', pos);
  return attrs;
}

/**
 * @param {string} xml
 * @returns {{name: string, qname: string, attrs: object, children: object[], text: string}} the root element
 */
export function parseXml(xml) {
  if (typeof xml !== 'string' || !xml.trim()) throw new CoreError('UBL_XML_EMPTY', 'no XML content');
  const src = xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml;
  const stack = [];
  let root = null;
  let pos = 0;
  while (pos < src.length) {
    const lt = src.indexOf('<', pos);
    const textEnd = lt === -1 ? src.length : lt;
    if (textEnd > pos) {
      const text = src.slice(pos, textEnd);
      if (stack.length) stack[stack.length - 1].text += decode(text, pos);
      else if (text.trim()) fail('text outside the root element', pos);
    }
    if (lt === -1) break;
    pos = lt;
    if (src.startsWith('<!--', pos)) {
      const end = src.indexOf('-->', pos + 4);
      if (end === -1) fail('unclosed comment', pos);
      pos = end + 3;
    } else if (src.startsWith('<![CDATA[', pos)) {
      const end = src.indexOf(']]>', pos + 9);
      if (end === -1 || !stack.length) fail('bad CDATA section', pos);
      stack[stack.length - 1].text += src.slice(pos + 9, end);
      pos = end + 3;
    } else if (src.startsWith('<?', pos)) {
      const end = src.indexOf('?>', pos + 2);
      if (end === -1) fail('unclosed processing instruction', pos);
      pos = end + 2;
    } else if (src.startsWith('<!', pos)) {
      throw new CoreError('UBL_XML_DOCTYPE', 'DOCTYPE and entity declarations are not accepted');
    } else if (src[pos + 1] === '/') {
      const end = src.indexOf('>', pos);
      if (end === -1) fail('unclosed end tag', pos);
      const qname = src.slice(pos + 2, end).trim();
      const open = stack.pop();
      if (!open || open.qname !== qname) fail(`unexpected </${qname}>`, pos);
      pos = end + 1;
    } else {
      const end = tagEnd(src, pos);
      if (end === -1) fail('unclosed start tag', pos);
      let inner = src.slice(pos + 1, end);
      const selfClosing = inner.endsWith('/');
      if (selfClosing) inner = inner.slice(0, -1);
      const nameMatch = /^[^\s/>]+/.exec(inner);
      if (!nameMatch) fail('missing element name', pos);
      const qname = nameMatch[0];
      const el = { name: localName(qname), qname, attrs: parseAttrs(inner.slice(qname.length), pos), children: [], text: '' };
      if (stack.length) stack[stack.length - 1].children.push(el);
      else if (root) fail('more than one root element', pos);
      else root = el;
      if (!selfClosing) stack.push(el);
      pos = end + 1;
    }
  }
  if (stack.length) fail(`unclosed <${stack[stack.length - 1].qname}>`, src.length);
  if (!root) fail('no root element', 0);
  return root;
}

/** First child element with the local name, following a path of names. */
export function child(el, ...path) {
  let current = el;
  for (const name of path) {
    current = current?.children.find(c => c.name === name);
    if (!current) return null;
  }
  return current;
}

/** All child elements with the local name. */
export function children(el, name) {
  return el ? el.children.filter(c => c.name === name) : [];
}

/** Trimmed text of the element at the path, or null. */
export function text(el, ...path) {
  const found = path.length ? child(el, ...path) : el;
  const value = found?.text?.trim();
  return value ? value : null;
}
