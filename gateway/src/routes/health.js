// GET /v1/health: version and the recent state of each upstream, for
// external monitoring. "degraded" when any upstream failed recently.
export default async function healthRoutes(app, { config, stats }) {
  app.get('/v1/health', async () => {
    const upstreams = stats ? stats.upstreamStatus() : {};
    return {
      status: Object.values(upstreams).includes('down') ? 'degraded' : 'ok',
      version: config.version,
      time: new Date().toISOString(),
      upstreams
    };
  });
}
