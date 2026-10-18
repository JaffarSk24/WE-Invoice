// QR codes in pictures: the browser's BarcodeDetector where it exists,
// jsQR (loaded on first use) elsewhere. A page can carry two codes (PAY by
// square and the eKasa code), and jsQR finds one at a time, so the halves
// and quarters of the page are searched too.
import { pixelsOf } from './image.js';

let jsQr = null;

async function loadJsQr() {
  if (!jsQr) jsQr = import('jsqr').then(m => m.default || m);
  return jsQr;
}

// Areas searched after the whole picture: halves, then quarters.
export function searchAreas(width, height) {
  const w2 = Math.floor(width / 2);
  const h2 = Math.floor(height / 2);
  return [
    { x: 0, y: 0, w: width, h: height },
    { x: 0, y: 0, w: width, h: h2 }, { x: 0, y: h2, w: width, h: height - h2 },
    { x: 0, y: 0, w: w2, h: h2 }, { x: w2, y: 0, w: width - w2, h: h2 },
    { x: 0, y: h2, w: w2, h: height - h2 }, { x: w2, y: h2, w: width - w2, h: height - h2 }
  ];
}

async function withDetector(canvas) {
  if (typeof globalThis.BarcodeDetector === 'undefined') return null;
  try {
    const formats = await globalThis.BarcodeDetector.getSupportedFormats();
    if (!formats.includes('qr_code')) return null;
    const found = await new globalThis.BarcodeDetector({ formats: ['qr_code'] }).detect(canvas);
    return found.map(f => f.rawValue).filter(Boolean);
  } catch (e) {
    console.warn('BarcodeDetector failed, falling back to jsQR', e);
    return null;
  }
}

/** Texts of the QR codes on a canvas, without duplicates. */
export async function findQrCodes(canvas) {
  const native = await withDetector(canvas);
  if (native && native.length) return [...new Set(native)];
  const decode = await loadJsQr();
  const found = new Set();
  for (const area of searchAreas(canvas.width, canvas.height)) {
    const pixels = pixelsOf(canvas, area);
    const hit = decode(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'dontInvert' });
    if (hit && hit.data) found.add(hit.data);
  }
  return [...found];
}
