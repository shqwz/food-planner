import { useState, useEffect } from "react";

export default function App() {
  const [user, setUser] = useState({ name: "Алексей", avatar: "🧑‍🍳" });

  const today = new Date().toLocaleDateString("ru-RU", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const todayFormatted = today.charAt(0).toUpperCase() + today.slice(1);

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
        </div>
        <div className="w-11 h-11 rounded-full flex items-center justify-center text-[20px]"
          style={{ background: "linear-gradient(135deg, #6c63ff, #00d9a3)" }}>
          {user.avatar}
        </div>
      </header>
    </div>
  );
}