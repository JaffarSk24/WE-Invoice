// WE Time Tracker to invoice lines (03-features.md § 3.15). Reads the
// JSON a user saves in Time Tracker (Reports, Export JSON: an array of
// time logs) or its full data file ({ timeLogs, clients, projects }).
// Billable, unpaid logs of the chosen client and period are grouped by
// project, by task (description) or by day; one line per group and rate:
// hours (minute precise, as Time Tracker bills them) x the rate stored on
// the log. The ids of the logs used come back, so a status file can tell
// Time Tracker which entries are invoiced.
import { CoreError } from '../errors.js';
import { div, round, mul, sum } from '../money/index.js';
import { localDate } from '../documents/dates.js';

export const TT_GROUPINGS = Object.freeze(['project', 'task', 'day']);
export const TT_STATUS_FORMAT = 'we-time-tracker-invoiced';

function durationMs(log) {
  if (log.durationMs !== undefined && log.durationMs !== null) return Number(log.durationMs);
  return Date.parse(log.endTime) - Date.parse(log.startTime);
}

// Minute precise with a minimum of one minute, like Time Tracker's billableHours.
function billableMinutes(ms) {
  if (!(ms > 0)) return 0;
  return Math.max(1, Math.round(ms / 60000));
}

/** Logs, clients and projects from either file shape. */
export function readTimeTracker(json) {
  let data = json;
  if (typeof json === 'string') {
    try {
      data = JSON.parse(json);
    } catch {
      throw new CoreError('IMPORT_FILE_DAMAGED', 'not a JSON file');
    }
  }
  const logs = Array.isArray(data) ? data : data && Array.isArray(data.timeLogs) ? data.timeLogs : null;
  if (!logs) throw new CoreError('IMPORT_FORMAT_UNKNOWN', 'not a WE Time Tracker export');
  const valid = logs.filter(l => l && l.id && l.startTime && l.endTime);
  return {
    logs: valid,
    clients: Array.isArray(data.clients) ? data.clients : [],
    projects: Array.isArray(data.projects) ? data.projects : []
  };
}

/** Clients found in the logs with their names when the file has them. */
export function timeTrackerClients(source) {
  const names = new Map(source.clients.map(c => [c.id, c.name]));
  const ids = [...new Set(source.logs.map(l => l.clientId || null))];
  return ids.map(id => ({ id, name: names.get(id) || null, count: source.logs.filter(l => (l.clientId || null) === id).length }));
}

/**
 * @param {string|object|Array} json
 * @param {{clientId?: string|null, from?: string, to?: string, unpaidOnly?: boolean, groupBy?: string,
 *   timeZone?: string, vatRate?: string, label?: (group: object) => string}} [ctx]
 *   vatRate: the rate of the lines (a VAT payer passes the standard rate), none for a non-payer
 * @returns {{lines: object[], logIds: string[], minutes: number, amount: string, skipped: number}}
 */
export function importTimeTracker(json, ctx = {}) {
  const source = readTimeTracker(json);
  const groupBy = TT_GROUPINGS.includes(ctx.groupBy) ? ctx.groupBy : 'project';
  const projects = new Map(source.projects.map(p => [p.id, p.name]));
  const dayOf = (log) => localDate(Date.parse(log.startTime), ctx.timeZone);
  const chosen = source.logs.filter(l => {
    if (ctx.clientId !== undefined && (l.clientId || null) !== ctx.clientId) return false;
    if (l.billable === false) return false;
    if (ctx.unpaidOnly !== false && l.paid) return false;
    const day = dayOf(l);
    return (!ctx.from || day >= ctx.from) && (!ctx.to || day <= ctx.to);
  });
  const groups = new Map();
  chosen.forEach(log => {
    const minutes = billableMinutes(durationMs(log));
    if (!minutes) return;
    const rate = String(log.rateAtTime ?? 0);
    const key = groupBy === 'project' ? log.projectId || '' : groupBy === 'task' ? (log.description || '').trim() : dayOf(log);
    const id = `${key}|${rate}`;
    const g = groups.get(id) || { key, rate, minutes: 0, logIds: [], days: [], projectName: projects.get(log.projectId) || null, description: (log.description || '').trim() };
    g.minutes += minutes;
    g.logIds.push(log.id);
    g.days.push(dayOf(log));
    groups.set(id, g);
  });
  const label = ctx.label || (g => (groupBy === 'project' ? g.projectName || g.description : groupBy === 'task' ? g.description : g.key) || g.key);
  const lines = [...groups.values()].map((g, i) => {
    const days = g.days.sort();
    return {
      id: `tt-${i + 1}`, kind: 'ITEM', itemId: null, name: label({ ...g, groupBy, from: days[0], to: days[days.length - 1] }),
      description: '', qty: round(div(String(g.minutes), '60', 10), 2), unit: { code: 'HUR', label: 'h' },
      unitPrice: round(g.rate, 2), priceType: 'NET', discountPct: null,
      vatCategory: ctx.vatRate ? 'S' : 'O', vatRate: ctx.vatRate || null,
      sourceLogIds: g.logIds
    };
  });
  const minutes = [...groups.values()].reduce((n, g) => n + g.minutes, 0);
  return {
    lines,
    logIds: lines.flatMap(l => l.sourceLogIds),
    minutes,
    amount: round(sum(lines.map(l => mul(l.qty, l.unitPrice))), 2),
    skipped: source.logs.length - chosen.length
  };
}

/** The status file for Time Tracker: which logs went on which invoice (P2). */
export function timeTrackerStatus({ logIds, documentNumber, invoicedAt }) {
  return { format: TT_STATUS_FORMAT, version: 1, invoicedAt, documentNumber: documentNumber || null, logIds: [...logIds] };
}
