// Slovak texts: gateway and network error codes (WP-GATEWAY). The gateway
// answers {error: {code}}; the client shows errors.<code>.
export default {
  "errors.BAD_REQUEST": "Neplatná požiadavka. Skontrolujte zadané údaje.",
  "errors.RATE_LIMITED": "Príliš veľa požiadaviek. Skúste to o chvíľu.",
  "errors.HOST_NOT_ALLOWED": "Adresa poskytovateľa nie je povolená.",
  "errors.PROVIDER_NOT_CONFIGURED": "Tento poskytovateľ ešte nemá zverejnenú adresu API.",
  "errors.BODY_TOO_LARGE": "Súbor je príliš veľký (limit 15 MB).",
  "errors.UNSUPPORTED_MEDIA_TYPE": "Nepodporovaný formát údajov.",
  "errors.INTERNAL": "Chyba servera. Skúste to neskôr.",
  "errors.NOT_CONFIGURED": "Táto služba ešte nie je na serveri nastavená.",
  "errors.UNAUTHORIZED": "Prístup zamietnutý.",
  "errors.INVALID_TOKEN": "Odkaz je neplatný.",
  "errors.TOKEN_EXPIRED": "Platnosť odkazu vypršala. Prihláste sa znova.",
  "errors.INVALID_EMAIL": "Zadajte platnú e-mailovú adresu.",
  "errors.CONSENT_REQUIRED": "Bez súhlasu so spracovaním údajov sa nedá prihlásiť.",
  "errors.MAIL_FAILED": "Potvrdzovací e-mail sa nepodarilo odoslať. Skúste to neskôr.",
  "errors.INVALID_CODE": "Kód pozvánky je neplatný.",
  "errors.CODE_USED": "Kód pozvánky už bol použitý.",
  "net.gateway.degraded": "Niektoré verejné služby sú dočasne nedostupné."
};
