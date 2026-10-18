// The pure parts of the Inbox readers: page text layout, regions for
// "Vybrať", QR search areas, picture sizes and OCR word positions.
import { describe, it, expect } from 'vitest';
import { itemsToLines, itemsToText, textInRegion, itemAt, regionOf } from './text-layout.js';
import { searchAreas } from './qr.js';
import { fitSize } from './image.js';
import { wordsOf, OCR_LANGUAGES } from './engine.js';

const item = (str, x, y, w = 0.1, h = 0.02) => ({ str, x, y, w, h });

describe('page text layout', () => {
  it('groups items into lines top to bottom and left to right', () => {
    const items = [item('IČO:', 0.1, 0.2, 0.05), item('45551235', 0.16, 0.201, 0.1), item('Faktúra', 0.1, 0.1), item('', 0.5, 0.5)];
    expect(itemsToLines(items)).toEqual(['Faktúra', 'IČO: 45551235']);
  });

  it('marks column gaps with two spaces', () => {
    const items = [item('Dodávateľ:', 0.05, 0.3, 0.12), item('Odberateľ:', 0.55, 0.3, 0.12)];
    expect(itemsToText(items)).toBe('Dodávateľ:  Odberateľ:');
  });

  it('joins pieces of one word without a space', () => {
    expect(itemsToText([item('SK66', 0.1, 0.1, 0.05), item('0900', 0.15, 0.1, 0.05)])).toBe('SK660900');
    expect(itemsToLines([])).toEqual([]);
    expect(itemsToLines(null)).toEqual([]);
  });

  it('reads the text inside a region and finds the item under a point', () => {
    const items = [item('2026-55', 0.6, 0.1), item('Spolu', 0.1, 0.8)];
    expect(textInRegion(items, { x: 0.55, y: 0.05, w: 0.3, h: 0.1 })).toBe('2026-55');
    expect(textInRegion(items, null)).toBe('');
    expect(itemAt(items, 0.65, 0.11).str).toBe('2026-55');
    expect(itemAt(items, 0.9, 0.9)).toBeNull();
    const r = regionOf({ ...item('x', 0, 0.995, 0.1, 0.01), page: 2 });
    expect(r.page).toBe(2);
    expect(r.x).toBe(0);
    expect(r.y + r.h).toBeLessThanOrEqual(1.0000001);
  });
});

describe('pictures', () => {
  it('searches the whole picture, its halves and quarters', () => {
    const areas = searchAreas(101, 51);
    expect(areas).toHaveLength(7);
    expect(areas[0]).toEqual({ x: 0, y: 0, w: 101, h: 51 });
    expect(areas[6]).toEqual({ x: 50, y: 25, w: 51, h: 26 });
  });

  it('scales photos down to the OCR limit and keeps small ones', () => {
    expect(fitSize(4000, 3000)).toEqual({ width: 2500, height: 1875 });
    expect(fitSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('turns OCR words into page fractions', () => {
    const data = { blocks: [{ paragraphs: [{ lines: [{ words: [{ text: 'IBAN', confidence: 91, bbox: { x0: 100, y0: 50, x1: 200, y1: 70 } }] }] }] }] };
    expect(wordsOf(data, 1000, 500)).toEqual([{ str: 'IBAN', x: 0.1, y: 0.1, w: 0.1, h: 0.04, confidence: 0.91 }]);
    expect(wordsOf({}, 10, 10)).toEqual([]);
  });

  it('ships the Slovak, Czech and English models', () => {
    expect(Object.keys(OCR_LANGUAGES)).toEqual(['slk', 'ces', 'eng']);
  });
});

describe('picking a phrase', () => {
  it('joins the words of an amount and stops at a column gap', async () => {
    const { phraseAt } = await import('./text-layout.js');
    const words = [
      { str: 'Spolu', page: 1, x: 0.1, y: 0.5, w: 0.08, h: 0.02 },
      { str: '1', page: 1, x: 0.6, y: 0.5, w: 0.01, h: 0.02 },
      { str: '234,50', page: 1, x: 0.615, y: 0.5, w: 0.06, h: 0.02 },
      { str: 'EUR', page: 1, x: 0.68, y: 0.5, w: 0.03, h: 0.02 },
      { str: 'X', page: 2, x: 0.62, y: 0.5, w: 0.03, h: 0.02 }
    ];
    const p = phraseAt(words, words[2]);
    expect(p.text).toBe('1 234,50 EUR');
    expect(p.region.x).toBeCloseTo(0.6);
    expect(p.region.page).toBe(1);
    expect(phraseAt(words, { str: 'alone', page: 3, x: 0, y: 0, w: 0.1, h: 0.1 }).text).toBe('alone');
  });
});
