// Gateway configuration from the environment (.env on the server). Secrets
// never have defaults and are never logged. Upstream URLs live here so a
// changed public API is a .env edit, not a release.
const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
const list = (v, d) => (v === undefined ? d : v).split(',').map(s => s.trim()).filter(Boolean);

export function loadConfig(env = process.env) {
  return {
    host: env.HOST || '127.0.0.1',
    port: num(env.PORT, 8787),
    version: env.APP_VERSION || '0.1.3',
    logLevel: env.LOG_LEVEL || 'info',
    corsOrigins: list(env.CORS_ORIGINS, 'https://jaffarsk24.github.io,http://localhost:5173'),
    // Trust only local proxies (nginx on loopback or on the Docker bridge):
    // the client address is the first public one nginx saw. "true" would
    // trust the whole X-Forwarded-For chain, which a client can fill in
    // itself and so get around the rate limits by IP.
    trustProxy: env.TRUST_PROXY === 'false' ? false : (env.TRUST_PROXY && env.TRUST_PROXY !== 'true' ? env.TRUST_PROXY : 'loopback,uniquelocal'),
    databasePath: env.DATABASE_PATH || ':memory:',
    siteUrl: (env.SITE_URL || 'https://jaffarsk24.github.io/WE-Invoice').replace(/\/+$/, ''),
    publicUrl: (env.PUBLIC_URL || 'https://invoice-api.whiteeagles.sk').replace(/\/+$/, ''),
    // Multiplier for every per-route limit; 0 disables rate limiting (tests).
    rateLimitScale: num(env.RATE_LIMIT_SCALE, 1),
    upstream: {
      timeoutMs: num(env.UPSTREAM_TIMEOUT_MS, 15000),
      // Shared ceiling of in-flight requests per upstream host, so a burst of
      // clients never gets the gateway banned by RPO or VIES.
      maxConcurrent: num(env.UPSTREAM_MAX_CONCURRENT, 8),
      rpoUrl: env.RPO_URL || 'https://api.statistics.sk/rpo/v1',
      aresUrl: env.ARES_URL || 'https://ares.gov.cz/ekonomicke-subjekty-v-be/rest',
      viesUrl: env.VIES_URL || 'https://ec.europa.eu/taxation_customs/vies/rest-api',
      ecbUrl: env.ECB_URL || 'https://www.ecb.europa.eu/stats/eurofxref',
      ekasaReceiptUrl: env.EKASA_RECEIPT_URL || 'https://ekasa.financnasprava.sk/mdu/api/v1/opd/receipt/find',
      // The API root; an older value ending in /lists is still accepted.
      fsOpenDataUrl: (env.FS_OPENDATA_URL || 'https://iz.opendata.financnasprava.sk/api').replace(/\/+$/, '').replace(/\/lists$/, ''),
      fsOpenDataApiKey: env.FS_OPENDATA_API_KEY || '',
      fsLists: {
        vatPayers: env.FS_LIST_VAT_PAYERS || 'ds_dphs',
        cancellationReasons: env.FS_LIST_CANCELLATION_REASONS || 'ds_dphz',
        deleted: env.FS_LIST_DELETED || 'ds_dphv',
        taxSubjects: env.FS_LIST_TAX_SUBJECTS || 'ds_dsrdp'
      },
      smlZone: env.PEPPOL_SML_ZONE || 'edelivery.tech.ec.europa.eu',
      smlLegacyCname: env.PEPPOL_SML_LEGACY_CNAME === 'true'
    },
    proxy: {
      maxBodyBytes: 15 * 1024 * 1024,
      // packages/core/peppol/providers.json; found automatically when unset.
      providersFile: env.PROVIDERS_FILE || '',
      // Operational override, JSON {providerId: baseUrl}: a provider that
      // publishes its API address between releases.
      baseUrls: parseJson(env.PROVIDER_BASE_URLS, {})
    },
    smtp: {
      host: env.SMTP_HOST || '',
      port: num(env.SMTP_PORT, 587),
      secure: env.SMTP_SECURE === 'true',
      user: env.SMTP_USER || '',
      pass: env.SMTP_PASS || '',
      from: env.SMTP_FROM || ''
    },
    // Mailgun HTTP API, used when SMTP is not set (the White Eagles site
    // sends through it already). The key lives only in the server env.
    mailgun: {
      apiKey: env.MAILGUN_API_KEY || '',
      domain: env.MAILGUN_DOMAIN || '',
      endpoint: env.MAILGUN_ENDPOINT || 'api.eu.mailgun.net'
    },
    waitlist: {
      confirmTtlHours: num(env.WAITLIST_CONFIRM_TTL_HOURS, 48),
      minFillSeconds: num(env.WAITLIST_MIN_FILL_SECONDS, 3),
      retentionMonths: num(env.WAITLIST_RETENTION_MONTHS, 24),
      // Off by default: sign-ups are taken at once and the owner writes to
      // people personally. On: double opt-in e-mail to the applicant.
      confirmByEmail: env.WAITLIST_CONFIRM_EMAIL === 'true',
      // Where a notice of every new sign-up goes (empty: no notice).
      ownerEmail: env.OWNER_NOTIFY_EMAIL || '',
      ownerLang: env.OWNER_NOTIFY_LANG || 'ru'
    },
    adminToken: env.ADMIN_TOKEN || '',
    betaHmacSecret: env.BETA_HMAC_SECRET || ''
  };
}

function parseJson(text, fallback) {
  if (!text) return fallback;
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' ? value : fallback;
  } catch (e) {
    console.warn('PROVIDER_BASE_URLS is not valid JSON, ignored:', e.message);
    return fallback;
  }
}
