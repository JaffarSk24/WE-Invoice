// SuperFaktúra API hosts per market, the allow-list of the import proxy.
// The same table lives in packages/core/imports/superfaktura-api.js
// (SF_MARKETS) for the client; the gateway image does not carry the core
// package, so it keeps this copy and a test checks that both match.
export const SF_MARKETS = Object.freeze({
  sk: 'https://moja.superfaktura.sk',
  cz: 'https://moje.superfaktura.cz',
  at: 'https://meine.superfaktura.at'
});
