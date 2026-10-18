// A small SVG chart for the reports: grouped bars per period and an
// optional line (a running balance), with a zero line, value ticks and a
// legend. Drawn by hand instead of a chart library, so the reports add no
// weight to the start of the app. Amounts arrive as decimal strings; they
// become numbers here only to place pixels, never for arithmetic.
import { h } from '../../ui/dom.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 720;
const H = 260;
const PAD = { top: 16, right: 12, bottom: 34, left: 64 };

function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => { if (v !== null && v !== undefined) el.setAttribute(k, String(v)); });
  children.flat().forEach(c => { if (c !== null && c !== undefined) el.appendChild(c instanceof Node ? c : document.createTextNode(String(c))); });
  return el;
}

/** Rounded upper bound and tick step for an axis from 0 (or a negative minimum) to max. */
export function niceScale(min, max, ticks = 4) {
  const span = Math.max(Math.abs(min), Math.abs(max), 1);
  const raw = span / ticks;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * power).find(m => m >= raw) || raw;
  const top = Math.ceil(max / step) * step;
  const bottom = min < 0 ? Math.floor(min / step) * step : 0;
  return { top: top || step, bottom, step };
}

/**
 * @param {{labels: string[], series: {name: string, values: string[], kind?: 'bar'|'line', cls: string}[],
 *   format: (value: number) => string, title: string}} options
 * @returns {HTMLElement} a figure with the SVG and its legend
 */
export function barChart({ labels, series, format, title }) {
  const numbers = series.map(se => se.values.map(v => Number(v) || 0));
  const all = numbers.flat();
  const { top, bottom, step } = niceScale(Math.min(0, ...all), Math.max(0, ...all));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const y = (v) => PAD.top + plotH * (top - v) / (top - bottom || 1);
  const band = plotW / Math.max(labels.length, 1);
  const bars = series.map((se, i) => ({ ...se, i })).filter(se => (se.kind || 'bar') === 'bar');
  const barW = Math.max(2, Math.min(28, (band * 0.8) / Math.max(bars.length, 1)));

  const grid = [];
  for (let v = bottom; v <= top + step / 2; v += step) {
    grid.push(s('line', { x1: PAD.left, x2: W - PAD.right, y1: y(v), y2: y(v), class: v === 0 ? 'chart-zero' : 'chart-grid' }));
    grid.push(s('text', { x: PAD.left - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'chart-tick' }, format(v)));
  }
  const every = Math.ceil(labels.length / 12);
  const xLabels = labels.map((label, i) => (i % every === 0
    ? s('text', { x: PAD.left + band * i + band / 2, y: H - PAD.bottom + 18, 'text-anchor': 'middle', class: 'chart-tick' }, label)
    : null));
  const rects = [];
  bars.forEach((se, b) => numbers[se.i].forEach((v, i) => {
    const x = PAD.left + band * i + (band - barW * bars.length) / 2 + b * barW;
    rects.push(s('rect', { x, y: Math.min(y(v), y(0)), width: barW - 1, height: Math.max(1, Math.abs(y(v) - y(0))), class: `chart-bar ${se.cls}` },
      s('title', {}, `${labels[i]}: ${se.name} ${format(v)}`)));
  }));
  const lines = series.map((se, i) => ({ ...se, i })).filter(se => se.kind === 'line').map(se => {
    const points = numbers[se.i].map((v, i) => `${PAD.left + band * i + band / 2},${y(v)}`).join(' ');
    return s('polyline', { points, class: `chart-line ${se.cls}`, fill: 'none' });
  });
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': title, class: 'chart-svg', preserveAspectRatio: 'xMidYMid meet' },
    s('title', {}, title), grid, xLabels, rects, lines);
  const legend = h('ul', { class: 'chart-legend' }, series.map(se => h('li', {}, h('span', { class: `chart-key ${se.cls}`, 'aria-hidden': 'true' }), se.name)));
  return h('figure', { class: 'chart' }, svg, legend);
}
