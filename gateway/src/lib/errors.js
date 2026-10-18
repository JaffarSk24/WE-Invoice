// Error format of every endpoint: {error: {code, message}}. Codes are stable;
// the client translates them (errors.<code>). Framework codes (FST_*) are
// mapped to the public ones so an internal name never leaks.
export class HttpError extends Error {
  constructor(statusCode, code, message) {
    super(message || code);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const badRequest = (code = 'BAD_REQUEST', message = 'Bad request') => new HttpError(400, code, message);
export const notFound = (message = 'Not found') => new HttpError(404, 'NOT_FOUND', message);
export const upstreamUnavailable = (message = 'Upstream unavailable') => new HttpError(502, 'UPSTREAM_UNAVAILABLE', message);

export function errorBody(code, message) {
  return { error: { code, message } };
}

const PUBLIC_CODE = /^[A-Z][A-Z_]*$/;

export function publicCode(error, status) {
  if (error instanceof HttpError && PUBLIC_CODE.test(error.code)) return error.code;
  if (status === 429) return 'RATE_LIMITED';
  if (status === 413) return 'BODY_TOO_LARGE';
  if (status === 415) return 'UNSUPPORTED_MEDIA_TYPE';
  if (status >= 500) return 'INTERNAL';
  return 'BAD_REQUEST';
}

export function installErrorHandler(app) {
  app.setNotFoundHandler((request, reply) => reply.code(404).send(errorBody('NOT_FOUND', 'Not found')));
  app.setErrorHandler((error, request, reply) => {
    const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    const code = publicCode(error, status);
    if (status >= 500 && code !== 'UPSTREAM_UNAVAILABLE') request.log.error({ err: { message: error.message, code } }, 'request failed');
    const message = status >= 500 && code === 'INTERNAL' ? 'Internal error' : error.message;
    reply.code(status).send(errorBody(code, message));
  });
}
