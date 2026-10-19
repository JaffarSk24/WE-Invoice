import { describe, it, expect } from 'vitest';
import { escapeXml, leaf, node, serialize } from './xml.js';
import { parseXml, child, children, text } from './xml-parse.js';

describe('XML writer', () => {
  it('escapes text and attributes and drops control characters', () => {
    expect(escapeXml(`a<b>&"c'\u0001`)).toBe('a&lt;b&gt;&amp;&quot;c&apos;');
  });

  it('drops empty values and empty elements (Peppol R008)', () => {
    expect(leaf('cbc:ID', '')).toBeNull();
    expect(leaf('cbc:ID', null)).toBeNull();
    expect(node('cac:X', [null, [leaf('cbc:A', ' ')]])).toBeNull();
    expect(leaf('cbc:A', '1', { unitCode: '', currencyID: 'EUR' }).attrs).toEqual({ currencyID: 'EUR' });
  });

  it('serialises with a declaration and indentation', () => {
    const xml = serialize(node('Root', [leaf('cbc:A', 'x & y'), node('cac:B', [leaf('cbc:C', '1')])], { xmlns: 'urn:x' }));
    expect(xml).toBe('<?xml version="1.0" encoding="UTF-8"?>\n<Root xmlns="urn:x">\n  <cbc:A>x &amp; y</cbc:A>\n  <cac:B>\n    <cbc:C>1</cbc:C>\n  </cac:B>\n</Root>\n');
  });
});

describe('XML parser', () => {
  it('reads elements, prefixes, attributes, entities, CDATA and comments', () => {
    const root = parseXml(String.fromCharCode(0xfeff) + '<?xml version="1.0"?><!-- c --><a:Root xmlns:a="urn:a" b="x &gt; y"><a:One k=\'v\'>1 &amp; &#50;&#x33;</a:One><Two><![CDATA[<raw>]]></Two><Empty/></a:Root>');
    expect(root.name).toBe('Root');
    expect(root.qname).toBe('a:Root');
    expect(root.attrs.b).toBe('x > y');
    expect(text(root, 'One')).toBe('1 & 23');
    expect(child(root, 'One').attrs.k).toBe('v');
    expect(text(root, 'Two')).toBe('<raw>');
    expect(children(root, 'Empty')).toHaveLength(1);
    expect(text(root, 'Missing')).toBeNull();
  });

  it('accepts ">" inside a quoted attribute', () => {
    expect(parseXml('<R a="1>2"><X/></R>').attrs.a).toBe('1>2');
  });

  it.each([
    ['', 'UBL_XML_EMPTY'],
    ['<a><b></a>', 'UBL_XML_INVALID'],
    ['<a>', 'UBL_XML_INVALID'],
    ['<a/><b/>', 'UBL_XML_INVALID'],
    ['text', 'UBL_XML_INVALID'],
    ['<a>&unknown;</a>', 'UBL_XML_INVALID'],
    ['<!DOCTYPE a [<!ENTITY x "y">]><a>&x;</a>', 'UBL_XML_DOCTYPE']
  ])('rejects %j with %s', (xml, code) => {
    expect(() => parseXml(xml)).toThrow(expect.objectContaining({ code }));
  });
});
