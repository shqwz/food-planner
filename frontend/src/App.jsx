import { useCallback, useEffect, useMemo, useState } from "react";
import PantryTab from "./tabs/PantryTab";
import PlanTab from "./tabs/PlanTab";
import DiaryTab from "./tabs/DiaryTab";
import ShoppingTab from "./tabs/ShoppingTab";
import BottomNav from "./components/BottomNav";
import { IconMoon, IconSun } from "./components/ui-icons";
import OnboardingWizard from "./onboarding/OnboardingWizard";
import ProfileScreen from "./screens/ProfileScreen";
import { getTelegramColorScheme, initTelegramWebApp } from "./lib/telegram";
import { apiGet } from "./api/client";

const THEME_KEY = "food-planner-theme";

function initialsFromName(name) {
  const s = (name || "?").trim();
  if (!s) return "?";
  return s
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function App() {
  const [user, setUser] = useState({ name: "Алексей", avatar: "АП", telegramId: 123456789 });
  const [activeTab, setActiveTab] = useState("plan");
  const [themeMode, setThemeMode] = useState(() => {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "dark") return v;
    if (v === "system") {
      const t = getTelegramColorScheme();
      localStorage.setItem(THEME_KEY, t);
      return t;
    }
    return "light";
  });
  const [notice, setNotice] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [showProfile, setShowProfile] = useState(false);
  const [wizardEdit, setWizardEdit] = useState(false);

  const todayFormatted = useMemo(
    () =>
      new Date()
        .toLocaleDateString("ru-RU", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
        .replace(/^./, (ch) => ch.toUpperCase()),
    [],
  );

  const refetchProfile = useCallback(async () => {
    const p = await apiGet("/api/profile", { user_id: user.telegramId });
    setProfile(p);
    if (p.exists && p.name) {
      setUser((u) => ({ ...u, name: p.name, avatar: initialsFromName(p.name) }));
    }
    return p;
  }, [user.telegramId]);

  useEffect(() => {
    initTelegramWebApp();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setProfileLoading(true);
      try {
        const p = await apiGet("/api/profile", { user_id: user.telegramId });
        if (!cancelled) {
          setProfile(p);
          if (p.exists && p.name) {
            setUser((u) => ({ ...u, name: p.name, avatar: initialsFromName(p.name) }));
          }
        }
      } catch {
        if (!cancelled) setProfile({ exists: false });
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user.telegramId]);

  useEffect(() => {
    const effectiveTheme = themeMode === "system" ? getTelegramColorScheme() : themeMode;
    document.documentElement.setAttribute("data-theme", effectiveTheme);
    localStorage.setItem(THEME_KEY, themeMode);
  }, [themeMode]);

  /** @param {string} text @param {'success'|'error'|'info'|'neutral'} [tone] */
  const showToast = (text, tone = "neutral") => {
    setNotice({ text, tone, at: Date.now() });
    setTimeout(() => setNotice(null), 2800);
  };

  const commonProps = { showToast, userId: user.telegramId };
  const themeAria =
    themeMode === "dark"
      ? "Тёмная тема. Нажмите, чтобы включить светлую"
      : "Светлая тема. Нажмите, чтобы включить тёмную";

  if (profileLoading) {
    return (
      <div className="app">
        <div className="content" style={{ padding: 24 }}>
          <div className="card" style={{ padding: 20 }}>
            Загрузка…
          </div>
        </div>
      </div>
    );
  }

  if (profile && !profile.exists) {
    return (
      <OnboardingWizard
        userId={user.telegramId}
        mode="onboard"
        initialProfile={profile}
        onDone={() => refetchProfile()}
      />
    );
  }

  if (wizardEdit && profile?.exists) {
    return (
      <OnboardingWizard
        userId={user.telegramId}
        mode="edit"
        initialProfile={profile}
        onCancel={() => setWizardEdit(false)}
        onDone={() => {
          setWizardEdit(false);
          refetchProfile();
        }}
      />
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <div className="topbar-title">
            {activeTab === "plan"
              ? "Сегодня"
              : activeTab === "diary"
                ? "Дневник"
                : activeTab === "pantry"
                  ? "Кладовая"
                  : "Список покупок"}
          </div>
          <div className="topbar-sub">{todayFormatted}</div>
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            className="icon-btn icon-btn--svg"
            onClick={() => setThemeMode((m) => (m === "dark" ? "light" : "dark"))}
            aria-label={themeAria}
          >
            {themeMode === "dark" ? <IconMoon size={20} /> : <IconSun size={20} />}
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => profile?.exists && setShowProfile(true)}
            aria-label="Профиль"
          >
            {user.avatar}
          </button>
        </div>
      </header>

      <main>
        {activeTab === "pantry" && <PantryTab {...commonProps} />}
        {activeTab === "plan" && <PlanTab {...commonProps} />}
        {activeTab === "diary" && <DiaryTab {...commonProps} />}
        {activeTab === "shopping" && <ShoppingTab {...commonProps} />}
      </main>

      {showProfile && profile?.exists && (
        <ProfileScreen
          profile={profile}
          onClose={() => setShowProfile(false)}
          onEdit={() => {
            setShowProfile(false);
            setWizardEdit(true);
          }}
        />
      )}

      {notice && (
        <div
          key={notice.at}
          className={`app-toast app-toast--${notice.tone}`}
          role="status"
          aria-live="polite"
        >
          {notice.text}
        </div>
      )}

      <BottomNav activeTab={activeTab} onSwitch={setActiveTab} />
    </div>
  );
}
