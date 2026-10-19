// Edge cases of the small XML parser used for received e-invoices: markup a
// sender may legitimately use (namespaces, CDATA, comments, processing
// instructions, quoted attributes) and malformed input that must be refused
// with UBL_XML_INVALID and the offset of the problem, never half parsed.
import { describe, it, expect } from 'vitest';
import { parseXml, child, children, text } from './xml-parse.js';

const invalid = (xml) => {
  try {
    parseXml(xml);
  } catch (error) {
    return error;
  }
  throw new Error(`expected ${JSON.stringify(xml)} to be refused`);
};

describe('XML parser: accepted markup', () => {
  it('keeps the prefix in qname and exposes the local name for any namespace prefix', () => {
    const root = parseXml('<inv:Invoice xmlns:inv="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:b="urn:b"><b:ID>FA1</b:ID></inv:Invoice>');
    expect(root.qname).toBe('inv:Invoice');
    expect(root.name).toBe('Invoice');
    expect(child(root, 'ID').qname).toBe('b:ID');
    expect(text(root, 'ID')).toBe('FA1');
  });

  it('stores attributes by local name and decodes entities inside them', () => {
    const root = parseXml('<R xml:lang="sk" note="a &lt; b &amp; c" k=\'it&apos;s\'/>');
    expect(root.attrs).toEqual({ lang: 'sk', note: 'a < b & c', k: "it's" });
  });

  it('accepts a quote of the other kind inside an attribute value', () => {
    const root = parseXml(`<R a="it's" b='say "hi"'/>`);
    expect(root.attrs).toEqual({ a: "it's", b: 'say "hi"' });
  });

  it('accepts whitespace around "=" and between attributes, and a space before "/>"', () => {
    const root = parseXml('<R>\n  <X  unitCode = "HUR"\n    currencyID=\'EUR\' />\n</R>');
    expect(child(root, 'X').attrs).toEqual({ unitCode: 'HUR', currencyID: 'EUR' });
    expect(child(root, 'X').children).toEqual([]);
  });

  it('accepts whitespace inside an end tag', () => {
    expect(text(parseXml('<cbc:ID>7</cbc:ID   >'))).toBe('7');
  });

  it('keeps CDATA content verbatim, without decoding entities', () => {
    const root = parseXml('<R><N><![CDATA[a &amp; <b> ]] ok]]></N></R>');
    expect(text(root, 'N')).toBe('a &amp; <b> ]] ok');
  });

  it('joins text around comments, CDATA and processing instructions inside an element', () => {
    const root = parseXml('<R>one <!-- skipped --> two <?pi skipped?> <![CDATA[three]]></R>');
    expect(root.text).toBe('one  two  three');
    expect(root.children).toEqual([]);
  });

  it('decodes decimal and hexadecimal character references, including characters outside the BMP', () => {
    expect(text(parseXml('<R>&#382;&#x161;&#x1F600;&#x10FFFF;</R>'))).toBe('žš\u{1F600}\u{10FFFF}');
  });

  it('leaves a lone ampersand that is not a reference as it is', () => {
    expect(text(parseXml('<R>AT&T</R>'))).toBe('AT&T');
  });

  it('allows comments and processing instructions before and after the root element', () => {
    const root = parseXml('<?xml version="1.0" encoding="UTF-8"?>\n<!-- head -->\n<R/>\n<!-- tail -->\n<?tail?>\n');
    expect(root.name).toBe('R');
  });

  it('lists repeated children in document order and nested paths by local name', () => {
    const root = parseXml('<R><cac:Line><cbc:ID>1</cbc:ID></cac:Line><x:Line><y:ID>2</y:ID></x:Line></R>');
    expect(children(root, 'Line').map(l => text(l, 'ID'))).toEqual(['1', '2']);
    expect(child(root, 'Line', 'Missing', 'ID')).toBeNull();
    expect(children(null, 'Line')).toEqual([]);
    expect(text(null, 'Line')).toBeNull();
  });

  it('gives null for an element that only holds whitespace', () => {
    expect(text(parseXml('<R><E>  \n\t </E></R>'), 'E')).toBeNull();
  });
});

describe('XML parser: refused input', () => {
  it.each([
    ['a character reference above U+10FFFF', '<R>&#x110000;</R>', /bad character reference &#x110000;/],
    ['a huge decimal character reference', '<R>&#99999999;</R>', /bad character reference/],
    ['an unknown entity in an attribute', '<R a="&nbsp;"/>', /unknown entity &nbsp;/],
    ['an unclosed comment', '<R><!-- never closed</R>', /unclosed comment/],
    ['an unterminated CDATA section', '<R><![CDATA[never closed</R>', /bad CDATA section/],
    ['CDATA outside the root element', '<![CDATA[x]]><R/>', /bad CDATA section/],
    ['an unclosed processing instruction', '<?xml version="1.0"<R/>', /unclosed processing instruction/],
    ['an unclosed end tag', '<R></R', /unclosed end tag/],
    ['an end tag without a start tag', '</R>', /unexpected <\/R>/],
    ['an unclosed start tag', '<R><cbc:ID', /unclosed start tag/],
    ['an attribute quote that is never closed', '<R><X a="1>2</X></R>', /unclosed start tag/],
    ['a tag without a name', '<R><></R>', /missing element name/],
    ['a space before the element name', '<R>< X/></R>', /missing element name/],
    ['an attribute without a value', '<R checked/>', /malformed attribute/],
    ['an unquoted attribute value', '<R a=1/>', /malformed attribute/],
    ['junk before an attribute', '<R ! a="1"/>', /malformed attribute/],
    ['junk after the last attribute', '<R a="1" b/>', /malformed attribute/],
    ['text after the root element', '<R/>tail', /text outside the root element/],
    ['only a comment', '<!-- nothing else -->', /no root element/],
    ['only a declaration', '<?xml version="1.0"?>\n', /no root element/]
  ])('refuses %s', (_label, xml, message) => {
    const error = invalid(xml);
    expect(error.code).toBe('UBL_XML_INVALID');
    expect(error.message).toMatch(message);
    expect(typeof error.details.offset).toBe('number');
  });

  it('reports the offset of the tag that is wrong', () => {
    expect(invalid('<R><A></B></R>').details.offset).toBe(6);
    expect(invalid('<R><A>').details.offset).toBe(6);
    expect(invalid('<R><!-- x').details.offset).toBe(3);
  });

  it.each([null, undefined, 42, '   \n'])('refuses %j as empty', (xml) => {
    expect(invalid(xml).code).toBe('UBL_XML_EMPTY');
  });

  it('refuses a DOCTYPE with an external identifier, also after the declaration', () => {
    expect(invalid('<?xml version="1.0"?><!DOCTYPE R SYSTEM "file:///etc/passwd"><R/>').code).toBe('UBL_XML_DOCTYPE');
  });
});
