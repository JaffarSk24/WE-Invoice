// The SuperFaktúra API over the transport. On the desktop the main
// process calls the API directly. In the browser a request is tried
// directly first; when the browser refuses it (the API sends no CORS
// headers) the rest of the session goes through the gateway proxy
// /v1/proxy/superfaktura/{market}/{path}, with the credential in
// X-Upstream-Authorization, which the gateway forwards without logging or
// storing it. Answers are read as JSON and API errors become error codes
// the screen translates.
import { CoreError } from '@we-invoice/core';
import { SF_MARKETS, SF_PAGE_SIZE, SF_DETAIL_BATCH, sfListPath, sfDetailsPath, readSfPage, readSfDetails } from '../../../../packages/core/imports/superfaktura-api.js';

const RETRIES = 3;

function failure(code, message) {
  return new CoreError(code, message);
}

async function readJson(response) {
  let text;
  try {
    text = await response.text();
  } catch (e) {
    throw failure('SF_ANSWER_UNREADABLE', `answer could not be read: ${e && e.message}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw failure('SF_ANSWER_UNREADABLE', `answer is not JSON (${response.status})`);
  }
}

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * @param {{transport: object, market?: string, auth: string, timeoutMs?: number, pauseMs?: number}} options
 *   auth: the value from sfAuthorization(); pauseMs: wait between requests (rate limit)
 */
export function createSfClient({ transport, market = 'sk', auth, timeoutMs = 60000, pauseMs = 0 }) {
  const base = SF_MARKETS[market];
  if (!base) throw failure('SF_MARKET_UNKNOWN', `unknown market ${market}`);
  let viaGateway = false;

  async function send(path) {
    if (viaGateway) {
      return transport.http({
        url: transport.gatewayUrl(`/v1/proxy/superfaktura/${market}${path}`), method: 'GET', timeoutMs,
        headers: { accept: 'application/json', 'x-upstream-authorization': auth }
      });
    }
    try {
      return await transport.http({ url: `${base}${path}`, method: 'GET', timeoutMs, headers: { accept: 'application/json', authorization: auth } });
    } catch (e) {
      // A refused cross-origin request looks like a network error in the browser.
      if (transport.platform !== 'web') throw failure('SF_UNREACHABLE', `${e && e.message}`);
      console.warn('SuperFaktura API not reachable from the browser, using the gateway', e && e.message);
      viaGateway = true;
      return send(path);
    }
  }

  async function get(path) {
    for (let attempt = 0; ; attempt++) {
      if (pauseMs) await wait(pauseMs);
      let response;
      try {
        response = await send(path);
      } catch (e) {
        if (e instanceof CoreError) throw e;
        throw failure('SF_UNREACHABLE', `${e && e.message}`);
      }
      if (response.status === 429 && attempt < RETRIES) {
        const after = Number((response.headers || {})['retry-after']) || 2 ** attempt;
        await wait(Math.min(after, 30) * 1000);
        continue;
      }
      if (response.status === 401 || response.status === 403) throw failure('SF_UNAUTHORIZED', `HTTP ${response.status}`);
      if (response.status === 404 && viaGateway) throw failure('SF_PROXY_UNAVAILABLE', 'the gateway has no SuperFaktura proxy');
      if (response.status === 429) throw failure('SF_RATE_LIMITED', 'too many requests');
      if (response.status >= 500) throw failure('SF_UNAVAILABLE', `HTTP ${response.status}`);
      const body = await readJson(response);
      if (!response.ok) throw failure('SF_API_ERROR', `HTTP ${response.status}`);
      return body;
    }
  }

  return { get, market, usesGateway: () => viaGateway };
}

/**
 * Everything a migration needs: clients, price list items and invoices
 * with their lines and payments, page by page.
 * @param {{get: Function}} client
 * @param {{onProgress?: Function, signal?: {aborted: boolean}, lists?: string[]}} [options]
 *   onProgress({ stage: 'clients'|'items'|'invoices'|'details', done, total })
 */
export async function fetchSuperfaktura(client, { onProgress = () => {}, signal = null, lists = ['clients', 'items', 'invoices'] } = {}) {
  const check = () => {
    if (signal && signal.aborted) throw failure('SF_CANCELLED', 'cancelled by the user');
  };
  const pages = async (list) => {
    const records = [];
    for (let page = 1, count = 1; page <= count; page++) {
      check();
      const result = readSfPage(await client.get(sfListPath(list, page, SF_PAGE_SIZE)));
      count = result.pageCount;
      records.push(...result.records);
      onProgress({ stage: list, done: page, total: count });
    }
    return records;
  };
  const out = { clients: [], items: [], invoices: [] };
  if (lists.includes('clients')) out.clients = await pages('clients');
  if (lists.includes('items')) out.items = await pages('items');
  if (lists.includes('invoices')) {
    const ids = (await pages('invoices')).map(r => (r.Invoice || r).id).filter(Boolean);
    for (let i = 0; i < ids.length; i += SF_DETAIL_BATCH) {
      check();
      out.invoices.push(...readSfDetails(await client.get(sfDetailsPath(ids.slice(i, i + SF_DETAIL_BATCH)))));
      onProgress({ stage: 'details', done: Math.min(i + SF_DETAIL_BATCH, ids.length), total: ids.length });
    }
  }
  return out;
}
