// The running eFaktúra service, loaded on first use: start-up
// (boot/peppol.js) registers a loader, the screens and the event handlers
// await the service, so its code stays out of the initial download.
let loader = null;

export function setPeppolServiceLoader(load) {
  loader = load;
}

/** @returns {Promise<object|null>} the service, or null before start-up */
export function getPeppolService() {
  return loader ? loader() : Promise.resolve(null);
}
