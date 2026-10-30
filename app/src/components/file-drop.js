// A place to drop files on, with a button that picks them instead: a
// dashed box with a title and a hint. Every way ends in onFiles(files).
// acceptDrops() lets any element (a whole screen) take dropped files too.
import { h, icon } from '../ui/dom.js';

/** Calls onFiles with the files dropped on el; el shows .is-over meanwhile. */
export function acceptDrops(el, onFiles) {
  let depth = 0;
  const hasFiles = (e) => Array.from((e.dataTransfer && e.dataTransfer.types) || []).includes('Files');
  el.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; depth++; el.classList.add('is-over'); });
  el.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  el.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) el.classList.remove('is-over'); });
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    el.classList.remove('is-over');
    const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
    if (files.length) onFiles(files);
  });
  return el;
}

/**
 * @param {{title: string, hint?: string, chooseLabel: string, accept?: string, multiple?: boolean,
 *   iconName?: string, onFiles: (files: File[]) => void}} options
 */
export function fileDrop({ title, hint = '', chooseLabel, accept = '', multiple = true, iconName = 'import', onFiles }) {
  const input = h('input', { type: 'file', accept, multiple, class: 'visually-hidden', tabindex: '-1', 'aria-hidden': 'true' });
  input.addEventListener('change', () => {
    const files = Array.from(input.files || []);
    input.value = '';
    if (files.length) onFiles(files);
  });
  const el = h('section', { class: 'file-drop', 'aria-label': title },
    icon(iconName), h('h3', {}, title), hint ? h('p', { class: 'muted' }, hint) : null,
    h('div', { class: 'actions-row' }, h('button', { type: 'button', class: 'btn btn-primary', dataset: { action: 'choose' }, onclick: () => input.click() }, icon('file-plus-2'), chooseLabel)),
    input);
  return acceptDrops(el, onFiles);
}
