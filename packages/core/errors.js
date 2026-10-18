// Errors raised by the core. Each carries a stable code that the interface
// translates through i18n (errors.<code>); the message is for the console.

export class CoreError extends Error {
  constructor(code, message, details = undefined) {
    super(message || code);
    this.name = 'CoreError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

// Thrown by the contract stubs of WP-0 until a work package implements them.
export class NotImplementedError extends CoreError {
  constructor(name) {
    super('NOT_IMPLEMENTED', `${name} is not implemented yet`);
    this.name = 'NotImplementedError';
  }
}

export function notImplemented(name) {
  return () => { throw new NotImplementedError(name); };
}
