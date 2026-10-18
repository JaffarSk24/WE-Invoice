// Ukrainian texts: gateway and network error codes (WP-GATEWAY). The
// gateway answers {error: {code}}; the client shows errors.<code>.
export default {
  "errors.BAD_REQUEST": "Неправильний запит. Перевірте введені дані.",
  "errors.RATE_LIMITED": "Забагато запитів. Спробуйте трохи пізніше.",
  "errors.HOST_NOT_ALLOWED": "Адресу провайдера не дозволено.",
  "errors.PROVIDER_NOT_CONFIGURED": "Цей провайдер ще не опублікував адресу API.",
  "errors.BODY_TOO_LARGE": "Файл завеликий (ліміт 15 МБ).",
  "errors.UNSUPPORTED_MEDIA_TYPE": "Непідтримуваний формат даних.",
  "errors.INTERNAL": "Помилка сервера. Спробуйте пізніше.",
  "errors.NOT_CONFIGURED": "Цю службу на сервері ще не налаштовано.",
  "errors.UNAUTHORIZED": "Доступ заборонено.",
  "errors.INVALID_TOKEN": "Посилання недійсне.",
  "errors.TOKEN_EXPIRED": "Термін дії посилання минув. Увійдіть знову.",
  "errors.INVALID_EMAIL": "Введіть правильну адресу електронної пошти.",
  "errors.CONSENT_REQUIRED": "Без згоди на обробку даних увійти не можна.",
  "errors.INVALID_CODE": "Код запрошення недійсний.",
  "errors.CODE_USED": "Код запрошення вже використано.",
  "net.gateway.degraded": "Деякі публічні сервіси тимчасово недоступні."
};
