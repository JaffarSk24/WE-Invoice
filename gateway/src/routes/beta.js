// POST /v1/beta/redeem: invite code to a signed beta token (one year).
export default async function betaRoutes(app, { invites }) {
  app.post('/v1/beta/redeem', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: { body: { type: 'object', required: ['code'], properties: { code: { type: 'string', minLength: 1, maxLength: 40 } } } }
  }, async (request) => invites.redeem(request.body.code));
}
