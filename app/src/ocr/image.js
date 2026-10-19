// Pictures for the Inbox: a photo or scan drawn on a canvas, scaled so its
// longer side stays within a limit (OCR is slow on 12 Mpx phone photos and
// gains nothing above ~2500 px), and its pixels for the QR search.
import { CoreError } from '@we-invoice/core';

export const MAX_SIDE = 2500;

/** Width and height that keep the ratio and fit the limit. */
export function fitSize(width, height, max = MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export async function imageToCanvas(blob, max = MAX_SIDE) {
  let bitmap;
  try {
    bitmap = await globalThis.createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch (e) {
    throw new CoreError('IMAGE_UNREADABLE', `The picture could not be read: ${e && e.message}`);
  }
  const { width, height } = fitSize(bitmap.width, bitmap.height, max);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  if (bitmap.close) bitmap.close();
  return canvas;
}

export function pixelsOf(canvas, area = null) {
  const a = area || { x: 0, y: 0, w: canvas.width, h: canvas.height };
  return canvas.getContext('2d', { willReadFrequently: true }).getImageData(a.x, a.y, a.w, a.h);
}
