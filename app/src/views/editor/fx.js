// The ECB reference rate of a currency on a date, through the gateway
// (/v1/rates/ecb, latest rate published on or before the date). The rate
// is the ECB quote: units of the currency per 1 EUR, as documents store
// fxRate. Errors carry codes the interface translates.
import { CoreError } from '@we-invoice/core';

export const CURRENCIES = Object.freeze(['EUR', 'CZK', 'USD', 'GBP', 'PLN', 'HUF', 'CHF']);

/** @returns {Promise<{rate: string, date: string}>} */
export async function fetchEcbRate(transport, currency, date) {
  let response;
  try {
    response = await transport.http({ url: transport.gatewayUrl(`/v1/rates/ecb?date=${encodeURIComponent(date)}`), method: 'GET', timeoutMs: 15000 });
  } catch (e) {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    throw new CoreError(offline ? 'OFFLINE' : 'UPSTREAM_UNAVAILABLE', `ECB rates failed: ${e && e.message}`);
  }
  if (!response.ok) throw new CoreError('UPSTREAM_UNAVAILABLE', `ECB rates answered ${response.status}`);
  const data = await response.json();
  const rate = data && data.rates && data.rates[currency];
  if (!rate || !/^[0-9]+(\.[0-9]+)?$/.test(rate)) throw new CoreError('FX_RATE_UNKNOWN', `No ECB rate for ${currency} on ${date}`);
  return { rate, date: data.date || date };
}
