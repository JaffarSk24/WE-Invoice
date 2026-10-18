// Czech texts: gateway and network error codes (WP-GATEWAY). The gateway
// answers {error: {code}}; the client shows errors.<code>.
export default {
  "errors.BAD_REQUEST": "Neplatný požadavek. Zkontrolujte zadané údaje.",
  "errors.RATE_LIMITED": "Příliš mnoho požadavků. Zkuste to za chvíli.",
  "errors.HOST_NOT_ALLOWED": "Adresa poskytovatele není povolena.",
  "errors.PROVIDER_NOT_CONFIGURED": "Tento poskytovatel ještě nemá zveřejněnou adresu API.",
  "errors.BODY_TOO_LARGE": "Soubor je příliš velký (limit 15 MB).",
  "errors.UNSUPPORTED_MEDIA_TYPE": "Nepodporovaný formát dat.",
  "errors.INTERNAL": "Chyba serveru. Zkuste to později.",
  "errors.NOT_CONFIGURED": "Tato služba ještě není na serveru nastavena.",
  "errors.UNAUTHORIZED": "Přístup odepřen.",
  "errors.INVALID_TOKEN": "Odkaz je neplatný.",
  "errors.TOKEN_EXPIRED": "Platnost odkazu vypršela. Přihlaste se znovu.",
  "errors.INVALID_EMAIL": "Zadejte platnou e-mailovou adresu.",
  "errors.CONSENT_REQUIRED": "Bez souhlasu se zpracováním údajů se nelze přihlásit.",
  "errors.INVALID_CODE": "Kód pozvánky je neplatný.",
  "errors.CODE_USED": "Kód pozvánky už byl použit.",
  "net.gateway.degraded": "Některé veřejné služby jsou dočasně nedostupné."
};
