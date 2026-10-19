// A small XML reader for bank statements (CAMT.053) without the DOM, so
// the core runs the same in the browser, in Node and in tests. It reads
// elements, attributes, text, CDATA and the five predefined entities plus
// numeric references; namespace prefixes are dropped (statements use one
// namespace). A DOCTYPE is refused: statements never need one and entity
// expansion is a known attack.
import { CoreError } from '../../../errors.js';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (whole, ref) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[ref] ?? whole;
  });
}

const localName = (name) => name.slice(name.indexOf(':') + 1);

function attributes(text) {
  const attrs = {};
  const re = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(text))) attrs[localName(m[1])] = decodeEntities(m[3] ?? m[4] ?? '');
  return attrs;
}

/**
 * Parses a document into { name, attrs, children, text }.
 * @returns {{name: string, attrs: object, children: object[], text: string}}
 */
export function parseXml(source) {
  const xml = String(source ?? '');
  if (/<!DOCTYPE/i.test(xml)) throw new CoreError('BANK_XML_INVALID', 'DOCTYPE is not allowed');
  const root = { name: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  let i = 0;
  while (i < xml.length) {
    const lt = xml.indexOf('<', i);
    const top = stack[stack.length - 1];
    if (lt < 0) { top.text += decodeEntities(xml.slice(i)); break; }
    if (lt > i) top.text += decodeEntities(xml.slice(i, lt));
    if (xml.startsWith('<!--', lt)) { i = end(xml, '-->', lt) + 3; continue; }
    if (xml.startsWith('<?', lt)) { i = end(xml, '?>', lt) + 2; continue; }
    if (xml.startsWith('<![CDATA[', lt)) {
      const close = end(xml, ']]>', lt);
      top.text += xml.slice(lt + 9, close);
      i = close + 3;
      continue;
    }
    const gt = end(xml, '>', lt);
    const tag = xml.slice(lt + 1, gt);
    i = gt + 1;
    if (tag.startsWith('/')) {
      const name = localName(tag.slice(1).trim());
      const open = stack.pop();
      if (!open || open.name !== name || stack.length === 0) throw new CoreError('BANK_XML_INVALID', `unexpected </${name}>`);
      continue;
    }
    const selfClosing = tag.endsWith('/');
    const body = selfClosing ? tag.slice(0, -1) : tag;
    const nameEnd = body.search(/[\s/]|$/);
    const node = { name: localName(body.slice(0, nameEnd)), attrs: attributes(body.slice(nameEnd)), children: [], text: '' };
    top.children.push(node);
    if (!selfClosing) stack.push(node);
  }
  if (stack.length !== 1) throw new CoreError('BANK_XML_INVALID', `unclosed <${stack[stack.length - 1].name}>`);
  const doc = root.children[0];
  if (!doc) throw new CoreError('BANK_XML_INVALID', 'no root element');
  return doc;
}

function end(xml, token, from) {
  const at = xml.indexOf(token, from);
  if (at < 0) throw new CoreError('BANK_XML_INVALID', `unterminated markup at ${from}`);
  return at;
}

/** Child elements by a path of names ("Acct/Id/IBAN"); every match. */
export function all(node, path) {
  let level = node ? [node] : [];
  for (const name of path.split('/')) {
    level = level.flatMap(n => n.children.filter(c => c.name === name));
  }
  return level;
}

/** First element on a path, or null. */
export function one(node, path) {
  return all(node, path)[0] || null;
}

/** Trimmed text of the first element on a path, or null. */
export function textAt(node, path) {
  const found = one(node, path);
  const s = found ? found.text.trim() : '';
  return s || null;
}
