// Gateway configuration from the environment (.env on the server). Secrets
// never have defaults and are never logged.
export function loadConfig(env = process.env) {
  return {
    host: env.HOST || '127.0.0.1',
    port: Number(env.PORT || 8787),
    version: env.APP_VERSION || '0.1.0',
    corsOrigins: (env.CORS_ORIGINS || 'https://jaffarsk24.github.io,http://localhost:5173').split(',').map(s => s.trim()).filter(Boolean),
    trustProxy: env.TRUST_PROXY !== 'false'
  };
}
