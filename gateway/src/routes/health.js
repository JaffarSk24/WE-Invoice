// GET /v1/health: version and status, for external monitoring.
export default async function healthRoutes(app, { config }) {
  app.get('/v1/health', async () => ({
    status: 'ok',
    version: config.version,
    time: new Date().toISOString(),
    upstreams: {}
  }));
}
