// Starts the gateway: node src/index.js (behind nginx on 127.0.0.1:8787).
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
