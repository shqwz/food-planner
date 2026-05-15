/** Подсказка для конфликта при сохранении приёма по плану (склад). */
const DIARY_CONFLICT_HINT =
  "Если нужно записать без списания со склада — «Не из меню» или «Другой приём».";

/**
 * Человекочитаемое сообщение об ошибке API или сети (fetch).
 * @param {unknown} err — ошибка из api/client (поле status) или TypeError от fetch
 * @param {{ context?: 'diary_save' }} [opts]
 */
export function formatApiError(err, opts = {}) {
  const raw = err?.message != null ? String(err.message).trim() : "";
  const status = typeof err?.status === "number" ? err.status : undefined;

  const looksLikeHtml = /^<[!\s]?[a-z]/i.test(raw);
  const bareHttp = /^HTTP \d{3}$/i.test(raw);

  // Нет ответа сервера (сеть, офлайн, CORS в деве)
  if (status === undefined || Number.isNaN(status)) {
    const nm = err?.name;
    if (nm === "AbortError") {
      return "Запрос прерван. Попробуйте ещё раз.";
    }
    if (
      nm === "TypeError" ||
      /failed to fetch|networkerror|load failed|fetch/i.test(raw) ||
      (!raw && nm)
    ) {
      return "Нет связи с сервером. Проверьте интернет и откройте приложение снова.";
    }
  }

  if (looksLikeHtml) {
    return "Сервер вернул неожиданный ответ. Попробуйте позже или полностью закройте мини-приложение и откройте снова.";
  }

  if (/ответ не JSON/i.test(raw)) {
    return status != null && status >= 500
      ? "Сервер временно недоступен. Попробуйте через минуту."
      : "Не удалось разобрать ответ сервера. Обновите экран.";
  }

  const serverMsg = raw && !bareHttp ? raw : "";

  if (opts.context === "diary_save" && status === 409) {
    const base = serverMsg || "Нельзя списать этот приём со склада «Дома».";
    return `${base} ${DIARY_CONFLICT_HINT}`.trim();
  }

  if (serverMsg) {
    return serverMsg;
  }

  switch (status) {
    case 400:
      return "Проверьте введённые данные и попробуйте снова.";
    case 401:
    case 403:
      return "Не удалось подтвердить доступ. Закройте мини-приложение и откройте его снова из бота.";
    case 404:
      return "Запрошенные данные не найдены на сервере.";
    case 409:
      return "Это действие сейчас недоступно: данные конфликтуют. Обновите экран и попробуйте снова.";
    case 413:
      return "Слишком большой объём данных.";
    case 422:
      return "Данные не подошли для сохранения.";
    case 429:
      return "Слишком много запросов. Подождите минуту и повторите.";
    default:
      if (status != null && status >= 500) {
        return "Сервер временно перегружен. Попробуйте через минуту.";
      }
      return "Что-то пошло не так. Попробуйте ещё раз.";
  }
}

/** Показать ошибку через тост приложения (длительность задаётся в showToast для error). */
export function toastApiError(showToast, err, opts) {
  showToast(formatApiError(err, opts), "error");
}
