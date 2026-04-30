import { useEffect, useMemo, useState } from "react";
import PantryTab from "./tabs/PantryTab";
import PlanTab from "./tabs/PlanTab";
import DiaryTab from "./tabs/DiaryTab";
import ShoppingTab from "./tabs/ShoppingTab";
import BottomNav from "./components/BottomNav";
import { getTelegramColorScheme, initTelegramWebApp } from "./lib/telegram";

const THEME_KEY = "food-planner-theme";

export default function App() {
  const [user] = useState({ name: "Алексей", avatar: "AP", telegramId: 123456789 });
  const [activeTab, setActiveTab] = useState("plan");
  const [themeMode, setThemeMode] = useState(() => localStorage.getItem(THEME_KEY) || "system");
  const [notice, setNotice] = useState(null);

  const todayFormatted = useMemo(() => new Date().toLocaleDateString("ru-RU", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  }), []).replace(/^./, (ch) => ch.toUpperCase());

  useEffect(() => {
    initTelegramWebApp();
  }, []);

  useEffect(() => {
    const effectiveTheme = themeMode === "system" ? getTelegramColorScheme() : themeMode;
    document.documentElement.setAttribute("data-theme", effectiveTheme);
    localStorage.setItem(THEME_KEY, themeMode);
  }, [themeMode]);

  const showToast = (icon, text) => {
    setNotice({ icon, text });
    setTimeout(() => setNotice(null), 2600);
  };

  const commonProps = { showToast, userId: user.telegramId };
  const nextThemeMode = () => {
    if (themeMode === "system") return "dark";
    if (themeMode === "dark") return "light";
    return "system";
  };
  const themeLabel = themeMode === "system" ? "⦿" : themeMode === "dark" ? "◐" : "◯";

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <div className="topbar-title">
            {activeTab === "plan" ? "Сегодня" : activeTab === "diary" ? "Дневник" : activeTab === "pantry" ? "Кладовая" : "Список покупок"}
          </div>
          <div className="topbar-sub">{todayFormatted}</div>
        </div>
        <div className="topbar-actions">
          <button className="icon-btn" onClick={() => setThemeMode(nextThemeMode())}>{themeLabel}</button>
          <button className="icon-btn">{user.avatar}</button>
        </div>
      </header>

      <main>
        {activeTab === "pantry" && <PantryTab {...commonProps} />}
        {activeTab === "plan" && <PlanTab {...commonProps} />}
        {activeTab === "diary" && <DiaryTab {...commonProps} />}
        {activeTab === "shopping" && <ShoppingTab {...commonProps} />}
      </main>

      {notice && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: "calc(var(--c-nav-h) + 14px + var(--c-safe-bottom))",
            zIndex: 140,
            background: "var(--c-surface)",
            border: "0.5px solid var(--c-border-mid)",
            borderRadius: "12px",
            padding: "10px 12px",
            boxShadow: "var(--shadow-sm)",
            fontSize: "13px",
            fontWeight: 600,
          }}
        >
          {notice.icon} {notice.text}
        </div>
      )}

      <BottomNav activeTab={activeTab} onSwitch={setActiveTab} />
    </div>
  );
}