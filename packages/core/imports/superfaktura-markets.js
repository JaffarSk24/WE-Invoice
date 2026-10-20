// Hosts of the SuperFaktura API per market. A file without imports, so the
// gateway tests can compare their own copy of the table with it without
// loading the rest of the core.
export const SF_MARKETS = Object.freeze({
  sk: 'https://moja.superfaktura.sk',
  cz: 'https://moje.superfaktura.cz',
  at: 'https://meine.superfaktura.at'
});
