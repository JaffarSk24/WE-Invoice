// Renders a waitlist e-mail (text and a minimal HTML) from the texts of
// mail/texts/<lang>.js. Placeholders {name} are replaced; everything in
// HTML is escaped. Unknown languages fall back to English.
import { texts } from './texts/index.js';

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function fill(template, params = {}) {
  return String(template).replace(/\{(\w+)\}/g, (m, key) => (params[key] === undefined ? m : String(params[key])));
}

export function renderMail(kind, lang, params = {}) {
  const dict = texts[lang] || texts.en;
  const t = dict[kind];
  if (!t) throw new Error(`Unknown mail kind: ${kind}`);
  const paragraphs = t.paragraphs.map(p => fill(p, params));
  const footer = fill(t.footer, params);
  const text = `${paragraphs.join('\n\n')}\n\n${t.signature}\n\n${footer}\n`;
  const html = `<!doctype html><html lang="${lang}"><body style="font-family:sans-serif;line-height:1.5;color:#1b1b1f">${
    paragraphs.map(p => `<p>${linkify(escapeHtml(p))}</p>`).join('')
  }<p>${escapeHtml(t.signature).replace(/\n/g, '<br>')}</p><p style="font-size:0.85em;color:#555">${linkify(escapeHtml(footer))}</p></body></html>`;
  const headers = {};
  if (params.unsubscribeUrl) {
    headers['List-Unsubscribe'] = `<${params.unsubscribeUrl}>`;
  }
  return { subject: fill(t.subject, params), text, html, headers };
}

// Bare https links become anchors in the HTML part.
function linkify(escaped) {
  return escaped.replace(/https:\/\/[^\s<]+/g, url => `<a href="${url}">${url}</a>`);
}
