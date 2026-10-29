// Barcodes into a field. A USB or Bluetooth scanner types the code and
// Enter: the field takes that Enter itself (data-own-enter, so the dialog
// does not save half filled) and hands the code on. Where the browser can
// read barcodes from a camera (BarcodeDetector with retail formats: Chrome
// on a Mac or Android, the desktop app on a Mac) a camera button opens a
// live view that fills the code in as soon as it reads one.
import { h, icon } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { openModal } from '../../ui/modal.js';
import { showToast } from '../../ui/toast.js';
import { t } from '../../i18n/index.js';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'codabar', 'qr_code'];
const EVERY_MS = 250;

/** The barcode formats the camera can read here; empty when it cannot. */
export async function cameraFormats(win = globalThis) {
  const Detector = win.BarcodeDetector;
  if (typeof Detector === 'undefined' || !win.navigator?.mediaDevices?.getUserMedia) return [];
  try {
    const supported = await Detector.getSupportedFormats();
    return FORMATS.filter(f => supported.includes(f));
  } catch (e) {
    console.warn('Barcode formats unknown', e);
    return [];
  }
}

/** Lets an input take the Enter of a scanner and report the code. */
export function scannerInput(input, onCode) {
  input.dataset.ownEnter = 'true';
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const code = input.value.trim();
    if (code) onCode(code);
  });
  return input;
}

function openCamera(formats, onCode) {
  const video = h('video', { class: 'scan-video', autoplay: true, muted: true, playsinline: true });
  let stream = null;
  let timer = null;
  let done = false;
  const stop = () => {
    done = true;
    clearTimeout(timer);
    if (stream) stream.getTracks().forEach(track => track.stop());
  };
  const modal = openModal({
    title: t('stock.scan.cameraTitle'),
    body: h('div', { class: 'scan-camera' }, video, h('p', { class: 'muted' }, t('stock.scan.cameraHint'))),
    actions: [{ label: t('common.cancel'), onClick: (m) => m.close() }],
    onClose: stop
  });
  const detector = new globalThis.BarcodeDetector({ formats });
  const look = async () => {
    if (done) return;
    try {
      const found = await detector.detect(video);
      const code = found.map(f => f.rawValue).find(Boolean);
      if (code) { modal.close(); onCode(code); return; }
    } catch (e) { /* the frame was not ready yet */ }
    timer = setTimeout(look, EVERY_MS);
  };
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
    .then((s) => {
      stream = s;
      if (done) { stop(); return; }
      video.srcObject = s;
      return video.play().then(look);
    })
    .catch((e) => {
      console.error('Camera not available', e);
      modal.close();
      showToast(t('stock.scan.cameraFailed'), { type: 'error' });
    });
}

/** A camera button for an input; hidden where the camera cannot read barcodes. */
export function cameraButton(onCode, { id = null } = {}) {
  const button = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', id, hidden: true, title: t('stock.scan.camera') }, icon('scan-line'), t('stock.scan.camera'));
  refreshIcons(button);
  cameraFormats().then((formats) => {
    if (!formats.length) return;
    button.hidden = false;
    button.addEventListener('click', () => openCamera(formats, onCode));
  });
  return button;
}
