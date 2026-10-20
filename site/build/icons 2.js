// Inline SVG icons for the landing page, taken from the lucide icon set at
// build time so the page needs no icon font and no extra request. Each icon
// is decorative: the heading next to it carries the meaning.
import * as lucide from 'lucide';

const SVG_ATTRS = 'xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';

function attrs(obj) {
  return Object.entries(obj).map(([k, v]) => ` ${k}="${v}"`).join('');
}

export function icon(name) {
  const node = lucide[name];
  if (!node) throw new Error(`Unknown icon ${name}`);
  const inner = node.map(([tag, a]) => `<${tag}${attrs(a)}/>`).join('');
  return `<svg ${SVG_ATTRS}>${inner}</svg>`;
}

// One icon per feature card, in the order of landing.features.items.
export const FEATURE_ICONS = ['FileText', 'Send', 'Landmark', 'BellRing', 'ScanLine', 'Percent', 'BookOpen', 'Building2', 'Smartphone'];
export const EFAKTURA_ICONS = ['Upload', 'Download', 'Check'];
export const PRIVACY_ICONS = ['ShieldCheck', 'Code2', 'FolderOutput'];
