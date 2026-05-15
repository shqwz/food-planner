const TABS = [
  { id: "plan", label: "Сегодня", icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="3" />
      <path d="M16 2v4M8 2v4M3 10h18" />
      <circle cx="12" cy="16" r="2" fill="currentColor" stroke="none" />
    </svg>
  )},
  { id: "stock", label: "Запасы", icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M5 7h14M8 11h6M8 15h4" />
    </svg>
  )},
  { id: "stats", label: "Статистика", icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 20V10M12 20V4M6 20v-6" />
    </svg>
  )},
];

export default function BottomNav({ activeTab, onSwitch }) {
  const resolvedTab =
    activeTab === "pantry" || activeTab === "shopping" ? "stock" : activeTab;

  return (
    <nav className="bottom-nav">
      {TABS.map((tab) => {
        const active = resolvedTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onSwitch(tab.id)}
            className={`nav-item ${active ? "active" : ""}`}
          >
            {tab.icon}
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
