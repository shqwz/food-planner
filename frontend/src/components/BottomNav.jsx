const TABS = [
  { id: "pantry",   emoji: "📦", label: "Кладовая" },
  { id: "plan",     emoji: "📋", label: "План"     },
  { id: "diary",    emoji: "📊", label: "Дневник"  },
  { id: "shopping", emoji: "🛒", label: "Корзина"  },
];

export default function BottomNav({ activeTab, onSwitch }) {
  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] flex z-50"
      style={{
        background: "rgba(26,29,38,0.94)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderTop: "1px solid rgba(255,255,255,0.07)",
        paddingBottom: "env(safe-area-inset-bottom, 12px)",
        paddingTop: "8px",
      }}
    >
      {TABS.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onSwitch(tab.id)}
            className="flex-1 flex flex-col items-center gap-0.5 py-1.5 transition-transform active:scale-90 border-none outline-none cursor-pointer"
            style={{ background: "none" }}
          >
            <div
              className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[18px] transition-all duration-300"
              style={
                active
                  ? {
                      background: "linear-gradient(135deg, rgba(108,99,255,0.3), rgba(0,217,163,0.2))",
                      transform: "scale(1.12) translateY(-2px)",
                      boxShadow: "0 4px 14px rgba(108,99,255,0.3)",
                    }
                  : {}
              }
            >
              {tab.emoji}
            </div>
            <span
              className="text-[10px] font-bold leading-none"
              style={{ color: active ? "var(--tg-accent)" : "var(--tg-muted)", transition: "color 0.2s" }}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
