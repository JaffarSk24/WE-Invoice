// Russian texts: gateway and network error codes (WP-GATEWAY). The gateway
// answers {error: {code}}; the client shows errors.<code>.
export default {
  "errors.BAD_REQUEST": "Неверный запрос. Проверьте введённые данные.",
  "errors.RATE_LIMITED": "Слишком много запросов. Попробуйте чуть позже.",
  "errors.HOST_NOT_ALLOWED": "Адрес провайдера не разрешён.",
  "errors.PROVIDER_NOT_CONFIGURED": "Этот провайдер ещё не опубликовал адрес API.",
  "errors.BODY_TOO_LARGE": "Файл слишком большой (лимит 15 МБ).",
  "errors.UNSUPPORTED_MEDIA_TYPE": "Неподдерживаемый формат данных.",
  "errors.INTERNAL": "Ошибка сервера. Попробуйте позже.",
  "errors.NOT_CONFIGURED": "Эта служба на сервере ещё не настроена.",
  "errors.UNAUTHORIZED": "Доступ запрещён.",
  "errors.INVALID_TOKEN": "Ссылка недействительна.",
  "errors.TOKEN_EXPIRED": "Срок действия ссылки истёк. Войдите снова.",
  "errors.INVALID_EMAIL": "Введите правильный адрес электронной почты.",
  "errors.CONSENT_REQUIRED": "Без согласия на обработку данных войти нельзя.",
  "errors.INVALID_CODE": "Код приглашения недействителен.",
  "errors.CODE_USED": "Код приглашения уже использован.",
  "net.gateway.degraded": "Некоторые публичные сервисы временно недоступны."
};
