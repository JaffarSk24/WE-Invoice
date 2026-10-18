// English texts: gateway and network error codes (WP-GATEWAY). The gateway
// answers {error: {code}}; the client shows errors.<code>.
export default {
  "errors.BAD_REQUEST": "Invalid request. Check the entered data.",
  "errors.RATE_LIMITED": "Too many requests. Try again in a moment.",
  "errors.HOST_NOT_ALLOWED": "The provider address is not allowed.",
  "errors.PROVIDER_NOT_CONFIGURED": "This provider has not published its API address yet.",
  "errors.BODY_TOO_LARGE": "The file is too large (limit 15 MB).",
  "errors.UNSUPPORTED_MEDIA_TYPE": "Unsupported data format.",
  "errors.INTERNAL": "Server error. Try again later.",
  "errors.NOT_CONFIGURED": "This service is not set up on the server yet.",
  "errors.UNAUTHORIZED": "Access denied.",
  "errors.INVALID_TOKEN": "The link is not valid.",
  "errors.TOKEN_EXPIRED": "The link has expired. Sign up again.",
  "errors.INVALID_EMAIL": "Enter a valid e-mail address.",
  "errors.CONSENT_REQUIRED": "You cannot sign up without consent to data processing.",
  "errors.INVALID_CODE": "The invite code is not valid.",
  "errors.CODE_USED": "The invite code has already been used.",
  "net.gateway.degraded": "Some public services are temporarily unavailable."
};
