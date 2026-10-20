// Document-style pages: privacy policy, terms, the thank-you page and the
// page shown after unsubscribing. The
// legal texts are structured JSON (sections of paragraphs and lists) so the
// six languages cannot drift in structure.
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

export function thanksBody(t) {
  return lines(
    '<article class="doc thanks">',
    `  <h1>${text(t.h1)}</h1>`,
    `  <p class="lead">${text(t.lead)}</p>`,
    `  <p>${text(t.meanwhile)}</p>`,
    '  <div class="buttons start">',
    `    <a class="btn primary" href="../app/">${text(t.ctaApp)}</a>`,
    `    <a class="btn" href="./">${text(t.ctaBack)}</a>`,
    '  </div>',
    `  <p class="note">${text(t.unsubscribe)}</p>`,
    '</article>'
  );
}

export function unsubscribedBody(t) {
  return lines(
    '<article class="doc thanks">',
    `  <h1>${text(t.h1)}</h1>`,
    `  <p class="lead">${text(t.lead)}</p>`,
    `  <p>${text(t.meanwhile)}</p>`,
    '  <div class="buttons start">',
    `    <a class="btn primary" href="../app/">${text(t.ctaApp)}</a>`,
    `    <a class="btn" href="./">${text(t.ctaBack)}</a>`,
    '  </div>',
    '</article>'
  );
}
