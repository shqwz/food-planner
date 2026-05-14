export function getTelegramWebApp() {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

export function initTelegramWebApp() {
  const tg = getTelegramWebApp();
  if (!tg) return null;
  tg.ready();
  tg.expand();
  return tg;
}

const DEV_USER_ID_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function firstInitial(name) {
  const s = (name || "?").trim();
  return s ? s[0].toUpperCase() : "?";
}

function initialsFromTgUser(u) {
  const fn = (u.first_name && String(u.first_name).trim()) || "";
  const ln = (u.last_name && String(u.last_name).trim()) || "";
  if (fn && ln) return `${fn[0]}${ln[0]}`.toUpperCase();
  if (fn.length >= 2) return fn.slice(0, 2).toUpperCase();
  if (fn) return fn[0].toUpperCase();
  if (u.username) return String(u.username).slice(0, 2).toUpperCase();
  return "?";
}

function parsePositiveInt(raw) {
  if (raw == null || raw === "") return null;
  const n = Number.parseInt(String(raw).replace(/\s+/g, ""), 10);
  if (!Number.isFinite(n) || n <= 0 || n > Number.MAX_SAFE_INTEGER) return null;
  return n;
}

function normalizeTelegramUserId(raw) {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return Math.trunc(raw);
  return parsePositiveInt(raw);
}

/**
 * Кто сейчас «вошёл» в приложение для API (user_id = telegram_id).
 *
 * 1) Mini App в Telegram: только initDataUnsafe.user.id (?user_id в URL не используем).
 * 2) Локальная отладка: ?user_id=ЧИСЛО на localhost / 127.0.0.1 или при import.meta.env.DEV.
 * 3) Иначе, на localhost / 127.0.0.1 — демо telegram_id=123456789 (Алексей).
 * 4) Иначе telegramId = null.
 *
 * @returns {{ telegramId: number | null, name: string, avatar: string }}
 */
export function resolveAppUserIdentity() {
  if (typeof window === "undefined") {
    return { telegramId: null, name: "", avatar: "?" };
  }

  initTelegramWebApp();
  const tg = getTelegramWebApp();
  const u = tg?.initDataUnsafe?.user;
  const tid = u ? normalizeTelegramUserId(u.id) : null;
  if (tid != null) {
    const name =
      (u.first_name && String(u.first_name).trim()) ||
      (u.username ? `@${u.username}` : "Пользователь");
    return { telegramId: tid, name, avatar: initialsFromTgUser(u) };
  }

  const host = window.location.hostname;
  const allowUrlOverride = import.meta.env.DEV || DEV_USER_ID_HOSTS.has(host);
  if (allowUrlOverride) {
    const fromQuery = parsePositiveInt(new URLSearchParams(window.location.search).get("user_id"));
    if (fromQuery != null) {
      return {
        telegramId: fromQuery,
        name: `Тест ${fromQuery}`,
        avatar: firstInitial(`T${fromQuery}`),
      };
    }
  }

  if (DEV_USER_ID_HOSTS.has(host)) {
    return { telegramId: 123456789, name: "Алексей", avatar: "А" };
  }

  return { telegramId: null, name: "", avatar: "?" };
}

export function getTelegramColorScheme() {
  const tg = getTelegramWebApp();
  if (!tg) return "light";
  return tg.colorScheme === "dark" ? "dark" : "light";
}
