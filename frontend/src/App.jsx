import { useMemo, useState } from "react";
import PantryTab from "./tabs/PantryTab";
import PlanTab from "./tabs/PlanTab";
import DiaryTab from "./tabs/DiaryTab";
import ShoppingTab from "./tabs/ShoppingTab";
import BottomNav from "./components/BottomNav";
import Toast from "./components/ui";

export default function App() {
  const [user] = useState({ name: "Алексей", avatar: "🧑‍🍳", telegramId: 123456789 });
  const [activeTab, setActiveTab] = useState("pantry");
  const [toast, setToast] = useState(null);

  const todayFormatted = useMemo(() => new Date().toLocaleDateString("ru-RU", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  }), []).replace(/^./, (ch) => ch.toUpperCase());

  const showToast = (icon, text) => {
    setToast({ icon, text });
    setTimeout(() => setToast(null), 1800);
  };

  const commonProps = { showToast, userId: user.telegramId };

  return (
    <div className="relative flex flex-col min-h-screen overflow-hidden max-w-md mx-auto"
      style={{ background: "var(--tg-bg)" }}
    >
      <header className="flex items-center justify-between px-5 pb-4 pt-14">
        <div>
          <h2 className="text-[22px] font-extrabold" style={{ color: "var(--tg-text)" }}>
            Привет, {user.name}!
          </h2>
          <p className="text-[13px]" style={{ color: "var(--tg-muted)" }}>{todayFormatted}</p>
          <p className="text-[12px] font-bold mt-1" style={{ color: "var(--tg-accent)" }}>
            Food Planner Mini App
          </p>
        </div>
        <div className="w-11 h-11 rounded-full flex items-center justify-center text-[20px]"
          style={{ background: "linear-gradient(135deg, #6c63ff, #00d9a3)" }}>
          {user.avatar}
        </div>
      </header>

      <main className="px-4 pb-28">
        {activeTab === "pantry" && <PantryTab {...commonProps} />}
        {activeTab === "plan" && <PlanTab {...commonProps} />}
        {activeTab === "diary" && <DiaryTab {...commonProps} />}
        {activeTab === "shopping" && <ShoppingTab {...commonProps} />}
      </main>

      <BottomNav activeTab={activeTab} onSwitch={setActiveTab} />
      {toast && <Toast icon={toast.icon} text={toast.text} />}
    </div>
  );
}