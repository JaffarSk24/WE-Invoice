// The preview of a received document's file next to the review form, and
// the "Vybrať" mode on it: every piece of text on the page becomes a
// button; the one the user clicks (with its neighbours on the line) fills
// the chosen field and its place on the page is remembered for the
// supplier. Pages come from this session's reading or are drawn again
// from the file kept on the device.
import { h, icon, clear } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { phraseAt } from '../../ocr/text-layout.js';
import { getFile } from './file-store.js';
import { recentRead } from './intake.js';

const PAGES = 3;
const WIDTH = 1400;

function copyCanvas(source) {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  canvas.getContext('2d').drawImage(source, 0, 0);
  return canvas;
}

// Pages to show: [{ canvas, items }].
async function loadPages(doc) {
  const read = recentRead(doc.id);
  if (read && read.canvases && read.canvases.length) return read.canvases.map((c, i) => ({ canvas: copyCanvas(c), items: (read.pages && read.pages[i]) || [] }));
  // An eFaktúra from Peppol is structured data; its XML lives in the Peppol archive.
  if (doc.peppol && doc.peppol.direction === 'IN') return [];
  const attachment = (doc.attachments || [])[0];
  const file = attachment ? await getFile(attachment.id) : null;
  if (!file) return null;
  const pages = file.pages || [];
  if (/pdf/i.test(file.type) || /\.pdf$/i.test(file.name)) {
    const { openPdf } = await import('../../ocr/pdf.js');
    const pdf = await openPdf(file.bytes);
    try {
      const out = [];
      for (let n = 1; n <= Math.min(pdf.numPages, PAGES); n++) {
        const canvas = document.createElement('canvas');
        await pdf.renderPage(n, canvas, WIDTH);
        out.push({ canvas, items: pages[n - 1] || [] });
      }
      return out;
    } finally {
      await pdf.destroy();
    }
  }
  if (/^image\//i.test(file.type)) {
    const { imageToCanvas } = await import('../../ocr/image.js');
    return [{ canvas: await imageToCanvas(new Blob([file.bytes], { type: file.type })), items: pages[0] || [] }];
  }
  return [];
}

export function createPreview(doc, { onPicked }) {
  let picking = null;
  let pages = [];
  const banner = h('div', { class: 'pick-banner', hidden: true, role: 'status' });
  const body = h('div', { class: 'preview-pages' }, h('p', { class: 'muted' }, t('purchase.preview.loading')));
  const el = h('section', { class: 'review-preview', tabindex: '0', 'aria-label': t('purchase.preview.title') }, banner, body);

  function stopPick() {
    picking = null;
    banner.hidden = true;
    el.classList.remove('is-picking');
  }

  function startPick(field) {
    if (!pages.some(p => p.items.length)) return false;
    picking = field;
    clear(banner);
    banner.append(icon('crosshair'), h('span', {}, t('purchase.preview.pickHint', { field: t(`purchase.field.${field}`) })),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: stopPick }, t('common.cancel')));
    banner.hidden = false;
    el.classList.add('is-picking');
    refreshIcons(banner);
    const first = el.querySelector('.pick-box');
    if (first) first.focus();
    return true;
  }

  function pageEl(page) {
    const overlay = h('div', { class: 'pick-layer' });
    page.items.forEach(item => {
      const pct = (v) => `${(v * 100).toFixed(3)}%`;
      overlay.append(h('button', {
        type: 'button', class: 'pick-box', 'aria-label': item.str,
        style: { left: pct(item.x), top: pct(item.y), width: pct(item.w), height: pct(item.h) },
        onclick: () => {
          if (!picking) return;
          const field = picking;
          const phrase = phraseAt(page.items, item);
          stopPick();
          onPicked(field, phrase.text, phrase.region);
        }
      }));
    });
    page.canvas.classList.add('preview-canvas');
    page.canvas.setAttribute('role', 'img');
    page.canvas.setAttribute('aria-label', t('purchase.preview.page'));
    return h('div', { class: 'preview-page' }, page.canvas, overlay);
  }

  loadPages(doc).then(loaded => {
    clear(body);
    pages = loaded || [];
    if (!loaded) body.append(h('p', { class: 'muted' }, t('purchase.preview.noFile')));
    else if (!loaded.length) body.append(h('p', { class: 'muted' }, t('purchase.preview.structured')));
    else loaded.forEach(p => body.append(pageEl(p)));
    el.dataset.ready = '1';
  }).catch(e => {
    console.error('Preview failed', e);
    clear(body);
    body.append(h('p', { class: 'field-error' }, t('purchase.preview.failed')));
    el.dataset.ready = '1';
  });

  return { el, startPick, stopPick, canPick: () => pages.some(p => p.items.length) };
}
