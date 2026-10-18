// Where files enter the Inbox: drag and drop, paste (Ctrl+V of a file or a
// screenshot), the file picker and, on a phone, the camera. Every way ends
// in onFiles(files). Paste is listened to only while the zone is on screen.
import { h, icon } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { isPhone } from '../../components/table.js';

export const ACCEPT = '.pdf,.xml,.isdoc,application/pdf,text/xml,application/xml,image/*';

function picker({ accept, capture = null, multiple = true, onFiles }) {
  const input = h('input', { type: 'file', accept, multiple, capture, class: 'visually-hidden', tabindex: '-1', 'aria-hidden': 'true' });
  input.addEventListener('change', () => {
    const files = Array.from(input.files || []);
    input.value = '';
    if (files.length) onFiles(files);
  });
  return input;
}

export function createDropZone({ onFiles, disabled = false }) {
  const filesInput = picker({ accept: ACCEPT, onFiles });
  const cameraInput = picker({ accept: 'image/*', capture: 'environment', multiple: false, onFiles });
  const choose = h('button', { type: 'button', class: 'btn btn-primary', disabled, dataset: { action: 'choose' }, onclick: () => filesInput.click() },
    icon('file-plus-2'), t('purchase.inbox.choose'));
  const camera = h('button', { type: 'button', class: 'btn', disabled, dataset: { action: 'camera' }, onclick: () => cameraInput.click() },
    icon('camera'), t('purchase.inbox.camera'));
  const el = h('section', { class: `inbox-drop ${disabled ? 'is-disabled' : ''}`.trim(), 'aria-label': t('purchase.inbox.drop.title') },
    icon('inbox', 'inbox-drop-icon'),
    h('h2', {}, t('purchase.inbox.drop.title')),
    h('p', { class: 'muted' }, t(isPhone() ? 'purchase.inbox.drop.hintPhone' : 'purchase.inbox.drop.hint')),
    h('div', { class: 'inbox-drop-actions' }, choose, camera),
    filesInput, cameraInput);

  if (!disabled) {
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('is-over'); });
    el.addEventListener('dragleave', () => el.classList.remove('is-over'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('is-over');
      const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
      if (files.length) onFiles(files);
    });
    const onPaste = (e) => {
      if (!el.isConnected) { document.removeEventListener('paste', onPaste); return; }
      const files = Array.from((e.clipboardData && e.clipboardData.files) || []);
      if (files.length) { e.preventDefault(); onFiles(files); }
    };
    document.addEventListener('paste', onPaste);
  }
  return el;
}
