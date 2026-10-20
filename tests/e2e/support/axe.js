// The accessibility audit of the end-to-end tests (WCAG 2.1 AA with
// axe-core): the serious and critical issues of the page as short lines.
// One analysis of a full screen takes several seconds of CPU and much more
// when every worker runs one at the same time, so a test that audits n
// screens takes its time from auditTimeout(n) instead of the default 30 s.
import AxeBuilder from '@axe-core/playwright';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// Time allowed for loading and auditing one screen, and for the rest.
export const AXE_SCREEN_MS = 20_000;
const BASE_MS = 30_000;

/** Test timeout for a test that audits `screens` screens. */
export function auditTimeout(screens) {
  return BASE_MS + screens * AXE_SCREEN_MS;
}

/** Serious and critical issues of the page, as "<name> <rule>: <targets>". */
export async function seriousIssues(page, name) {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return result.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
    .map(v => `${name} ${v.id}: ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(', ')}`);
}
