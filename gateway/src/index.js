// Starts the gateway: node src/index.js (behind nginx on 127.0.0.1:8787).
// SIGTERM and SIGINT close the server and the database cleanly.
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = await buildApp(config);
try {
  await app.listen({ host: config.host, port: config.port });
} catch (e) {
  app.log.error(e);
  process.exit(1);
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => {
    app.log.info({ signal }, 'shutting down');
    app.close().then(() => process.exit(0), () => process.exit(1));
  });
}
