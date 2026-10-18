// German texts: gateway and network error codes (WP-GATEWAY). The gateway
// answers {error: {code}}; the client shows errors.<code>.
export default {
  "errors.BAD_REQUEST": "Ungültige Anfrage. Prüfen Sie die eingegebenen Daten.",
  "errors.RATE_LIMITED": "Zu viele Anfragen. Versuchen Sie es gleich noch einmal.",
  "errors.HOST_NOT_ALLOWED": "Die Adresse des Anbieters ist nicht erlaubt.",
  "errors.PROVIDER_NOT_CONFIGURED": "Dieser Anbieter hat noch keine API-Adresse veröffentlicht.",
  "errors.BODY_TOO_LARGE": "Die Datei ist zu groß (Grenze 15 MB).",
  "errors.UNSUPPORTED_MEDIA_TYPE": "Nicht unterstütztes Datenformat.",
  "errors.INTERNAL": "Serverfehler. Bitte versuchen Sie es später.",
  "errors.NOT_CONFIGURED": "Dieser Dienst ist auf dem Server noch nicht eingerichtet.",
  "errors.UNAUTHORIZED": "Zugriff verweigert.",
  "errors.INVALID_TOKEN": "Der Link ist ungültig.",
  "errors.TOKEN_EXPIRED": "Der Link ist abgelaufen. Melden Sie sich erneut an.",
  "errors.INVALID_EMAIL": "Geben Sie eine gültige E-Mail-Adresse ein.",
  "errors.CONSENT_REQUIRED": "Ohne Einwilligung in die Datenverarbeitung ist keine Anmeldung möglich.",
  "errors.INVALID_CODE": "Der Einladungscode ist ungültig.",
  "errors.CODE_USED": "Der Einladungscode wurde bereits verwendet.",
  "net.gateway.degraded": "Einige öffentliche Dienste sind vorübergehend nicht erreichbar."
};
