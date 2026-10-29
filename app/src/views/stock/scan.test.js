// @vitest-environment happy-dom
// The scanner field and the camera support check.
import { describe, it, expect, vi } from 'vitest';
import { cameraFormats, scannerInput } from './scan.js';

describe('barcode scanning', () => {
  it('reads retail formats where the browser has a detector and a camera', async () => {
    const win = { BarcodeDetector: { getSupportedFormats: async () => ['qr_code', 'ean_13', 'aztec'] }, navigator: { mediaDevices: { getUserMedia() {} } } };
    expect(await cameraFormats(win)).toEqual(['ean_13', 'qr_code']);
    expect(await cameraFormats({ navigator: win.navigator })).toEqual([]);
    expect(await cameraFormats({ BarcodeDetector: win.BarcodeDetector, navigator: {} })).toEqual([]);
    const broken = { BarcodeDetector: { getSupportedFormats: async () => { throw new Error('x'); } }, navigator: win.navigator };
    expect(await cameraFormats(broken)).toEqual([]);
  });

  it('hands on the code at the Enter of a scanner and keeps that Enter', () => {
    const input = document.createElement('input');
    const onCode = vi.fn();
    scannerInput(input, onCode);
    expect(input.dataset.ownEnter).toBe('true');
    input.value = ' 8580000000017 ';
    const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    input.dispatchEvent(enter);
    expect(onCode).toHaveBeenCalledWith('8580000000017');
    expect(enter.defaultPrevented).toBe(true);
    input.value = '';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onCode).toHaveBeenCalledOnce();
  });
});
