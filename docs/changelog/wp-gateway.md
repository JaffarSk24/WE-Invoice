# WP-GATEWAY

## Added

- Gateway routes of 06-gateway-server.md § 6.3: streaming proxy to allow-listed Peppol providers (X-Upstream-Authorization becomes Authorization, 15 MB limit, private networks and cross-host redirects refused, answers never cached), Slovak company by IČO and search (RPO plus DIČ and IČ DPH from the FS open data), Czech company (ARES), VIES, Slovak VAT payer reliability (FS lists), ECB rates with history, eKasa receipt lookup (configurable URL), Peppol participant lookup (SML NAPTR with SHA-256 Base32 per Policy for use of Identifiers 4.4, optional legacy MD5 CNAME, SMP ServiceGroup), waitlist with double opt-in, confirm, unsubscribe, beta code redeem (HMAC token for one year), admin CSV export and counters.
- SQLite storage (better-sqlite3): waitlist, invite codes, public data cache with TTL per entry, request counters per route and day.
- Security: CORS for the site and the dev server only, per-route rate limits (@fastify/rate-limit) and a shared concurrency ceiling per upstream, security headers, one error format {error: {code, message}}, 502 UPSTREAM_UNAVAILABLE on every upstream failure, DNS guard against private addresses at connect time.
- Logging: route pattern, status, duration and anonymised IP only; authorization headers, URL, query, params and bodies are redacted; the proxy adds Cache-Control: no-store.
- Waitlist e-mails (confirmation and beta invitation) in Slovak, Czech, English, German, Russian and Ukrainian as data in gateway/src/mail/texts.
- Owner's script gateway/scripts/send-invites.mjs: invite codes from a CSV and the invitation e-mails, run by hand.
- Deployment files without deploying: deploy/discover.sh (read-only survey), deploy/nginx-invoice-api.conf, Dockerfile and docker-compose.yml, systemd unit, deploy/backup-sqlite.sh (14-day rotation), deploy/rollback.sh, deploy/README.md with the commands for Docker Compose and for systemd with Node 22.
- Tests with undici MockAgent for every route, SSRF guard, log masking, rate limit, double opt-in and a contract test against openapi.yaml with ajv; coverage threshold 90 % in npm test.
- Client dictionaries (sk, en) for the gateway error codes in app/src/i18n/*/net.js.

## Changed

- The proxy allow-list is built from packages/core/peppol/providers.json at start (PROVIDERS_FILE and PROVIDER_BASE_URLS in .env adjust it); the Docker image is built from the repository root so it carries that file.
- gateway/.env.example lists every setting of the gateway.
