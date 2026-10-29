// Document-style pages: privacy policy and terms. The legal texts are
// structured JSON (sections of paragraphs and lists) so the six languages
// cannot drift in structure.
import { text, inline, lines, indent } from './html.js';

function block(b) {
  if (b.p) return `<p>${inline(b.p)}</p>`;
  if (b.ul) return lines('<ul>', indent(b.ul.map(li => `<li>${inline(li)}</li>`).join('\n')), '</ul>');
  throw new Error('Unknown block type');
}

export function legalBody(doc) {
  const sections = doc.sections.map(s => lines(
    `<section>`,
    `  <h2>${text(s.h2)}</h2>`,
    indent(s.blocks.map(block).join('\n')),
    '</section>'
  )).join('\n');
  return lines(
    '<article class="doc">',
    `  <h1>${text(doc.h1)}</h1>`,
    `  <p class="meta">${text(doc.effective)}</p>`,
    `  <p>${inline(doc.intro)}</p>`,
    indent(sections),
    '</article>'
  );
}
