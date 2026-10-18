// The close handshake with the main process: before the window goes away,
// modules get a moment to finish (sync pushes unsent changes). The desktop
// module emits "app:before-close" with a wait(promise) the modules call;
// when every promise settles, or after the timeout, the main process is
// told to close. Nothing here is Electron-specific, so it is tested as is.

// The page answers a little before the main process gives up (8 s there).
export const CLOSE_TIMEOUT_MS = 7000;

// Collects the promises of one close round; `run()` resolves when they
// settle or the timeout hits.
export function createCloseRound({ timeoutMs = CLOSE_TIMEOUT_MS, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const waits = [];
  return {
    wait(promise) {
      waits.push(Promise.resolve(promise).catch(e => console.error('Work before closing failed', e)));
    },
    run() {
      let timer = null;
      const timeout = new Promise(resolve => { timer = setTimer(() => resolve('timeout'), timeoutMs); });
      return Promise.race([Promise.all(waits).then(() => 'done'), timeout]).then(result => { clearTimer(timer); return result; });
    }
  };
}

// Wires weApp.onBeforeClose to the event bus. Returns the unsubscribe.
export function initCloseHandshake(weApp, emit, options = {}) {
  if (!weApp || typeof weApp.onBeforeClose !== 'function') return () => {};
  return weApp.onBeforeClose(async () => {
    const round = createCloseRound(options);
    try {
      emit('app:before-close', { wait: round.wait });
      await round.run();
    } finally {
      weApp.closeReady();
    }
  });
}
