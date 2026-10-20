// Small HTML helpers for the site templates: escaping, a tiny inline markup
// for links and emphasis inside content texts, and the typographic
// non-breaking space between a number and its unit (23 %, 5 €), which the
// Slovak, Czech and German norms require and which must not wrap.
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escape(text) {
  return String(text ?? '').replace(/[&<>"']/g, ch => ESCAPES[ch]);
}

// Number followed by a unit: the space becomes non-breaking. Also the date
// form "1. 1. 2027" keeps its parts on one line.
export function typography(html) {
  return html
    .replace(/(\d) (€|%|USD|Kč|CZK)/g, '$1&nbsp;$2')
    .replace(/(\d)\. (\d{1,2})\. (\d{4})/g, '$1.&nbsp;$2.&nbsp;$3');
}

const SAFE_HREF = /^(https:\/\/|mailto:|\.\/|\.\.\/|#)/;

// Content texts may contain [text](url) links and **bold**. Everything else
// is escaped; a link with an unexpected scheme is rendered as plain text.
export function inline(text) {
  const escaped = escape(text);
  const linked = escaped.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => {
    if (!SAFE_HREF.test(href)) return label;
    const external = href.startsWith('https://') ? ' rel="noopener"' : '';
    return `<a href="${href}"${external}>${label}</a>`;
  });
  return typography(linked.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'));
}

// Plain text with typography, no markup.
export function text(value) {
  return typography(escape(value));
}

export function attr(value) {
  return typography(escape(value));
}

// Joins template pieces, dropping empty ones, so optional parts read well.
export function lines(...parts) {
  return parts.flat().filter(Boolean).join('\n');
}

// Indents a block by n spaces for readable output.
export function indent(block, n = 2) {
  const pad = ' '.repeat(n);
  return block.split('\n').map(l => (l ? pad + l : l)).join('\n');
}

// Markdown-free text for meta descriptions and OG tags: strips the inline
// markup so a description never shows brackets.
export function plain(value) {
  return String(value ?? '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*/g, '');
}
