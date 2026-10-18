// Error format of every endpoint: {error: {code, message}}. Codes are stable;
// the client translates them (errors.<code>).
export function errorBody(code, message) {
  return { error: { code, message } };
}

export function installErrorHandler(app) {
  app.setNotFoundHandler((request, reply) => reply.code(404).send(errorBody('NOT_FOUND', 'Not found')));
  app.setErrorHandler((error, request, reply) => {
    const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    const code = error.code && /^[A-Z_]+$/.test(error.code) ? error.code : status === 429 ? 'RATE_LIMITED' : status >= 500 ? 'INTERNAL' : 'BAD_REQUEST';
    if (status >= 500) request.log.error({ err: { message: error.message, code } }, 'request failed');
    reply.code(status).send(errorBody(code, status >= 500 ? 'Internal error' : error.message));
  });
}
