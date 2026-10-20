# WP-GATEWAY

## Added

- Gateway route GET /v1/proxy/superfaktura/{market}/{path} for the SuperFaktúra import in the web app: markets sk, cz and at map to the fixed API hosts (the same table as SF_MARKETS in packages/core, checked by a test), the path is limited to the characters of the API paths and cannot leave the host, X-Upstream-Authorization is sent upstream as Authorization, the answer is streamed with Cache-Control: no-store, redirects are followed only on the same host, and 60 requests a minute per IP. Other methods answer 405 METHOD_NOT_ALLOWED. The credential, path, query and bodies never reach the logs or the counters.
- The route in gateway/openapi.yaml and its tests (proxied GET with a mocked upstream, unknown market, path traversal, refused writes, log masking, no-store, CORS, private address refusal).
- Privacy policy in all six languages: the SuperFaktúra API key passes through the gateway in the web version only for the duration of a read request and is never logged, cached or stored; the desktop app calls the API directly.

## Changed

- The path guard of the Peppol proxy is shared with the new route and also refuses mixed plain and encoded dot segments and an encoded backslash.
