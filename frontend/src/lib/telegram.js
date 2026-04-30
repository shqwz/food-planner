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

export function getTelegramColorScheme() {
  const tg = getTelegramWebApp();
  if (!tg) return "light";
  return tg.colorScheme === "dark" ? "dark" : "light";
}
