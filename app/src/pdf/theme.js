// Colours and sizes of the printed document. The brand colour comes from
// the company (defaults.brandColor); the tints and the text colour on it
// are derived here so every template stays readable with any brand.
// Colours are hex strings, which is what pdfmake takes.

export const DEFAULT_BRAND = '#1f4e79';
const HEX = /^#([0-9a-f]{6})$/i;

export function normalizeBrand(color) {
  const text = String(color || '').trim();
  if (HEX.test(text)) return text.toLowerCase();
  const short = /^#([0-9a-f]{3})$/i.exec(text);
  if (short) return `#${short[1].split('').map(c => c + c).join('')}`.toLowerCase();
  return DEFAULT_BRAND;
}

function rgb(hex) {
  const m = HEX.exec(hex);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hex(channels) {
  return `#${channels.map(c => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')}`;
}

// Mixes a colour with white: ratio 0.9 gives a very light tint.
export function tint(color, ratio) {
  return hex(rgb(normalizeBrand(color)).map(c => c + (255 - c) * ratio));
}

export function shade(color, ratio) {
  return hex(rgb(normalizeBrand(color)).map(c => c * (1 - ratio)));
}

// Relative luminance (WCAG) decides whether text on the brand colour is
// white or dark.
export function luminance(color) {
  const [r, g, b] = rgb(normalizeBrand(color)).map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function textOn(color) {
  return luminance(color) > 0.45 ? '#1a1a1a' : '#ffffff';
}

/**
 * @param {string|null} brandColor
 * @param {object} template  the template's size settings
 */
export function buildTheme(brandColor, template) {
  const brand = normalizeBrand(brandColor);
  return {
    brand,
    onBrand: textOn(brand),
    tint: tint(brand, 0.88),
    tintStrong: tint(brand, 0.72),
    text: '#1a1a1a',
    muted: '#5b6470',
    line: '#c9ced6',
    lineLight: '#e3e6eb',
    white: '#ffffff',
    fontSize: template.fontSize,
    small: template.smallSize,
    title: template.titleSize,
    gap: template.gap
  };
}
