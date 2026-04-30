const TABS = [
  { id: "plan", label: "Сегодня", icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="3" />
      <path d="M16 2v4M8 2v4M3 10h18" />
      <circle cx="12" cy="16" r="2" fill="currentColor" stroke="none" />
    </svg>
  )},
  { id: "diary", label: "Дневник", icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16v16H4z" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  )},
  { id: "pantry", label: "Кладовая", icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M5 7h14M8 11h6M8 15h4" />
    </svg>
  )},
  { id: "shopping", label: "Список", icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <path d="M3 6h18M16 10a4 4 0 0 1-8 0" />
    </svg>
  )},
];

export default function BottomNav({ activeTab, onSwitch }) {
  return (
    <nav className="bottom-nav">
      {TABS.map((tab) => {
        const active = activeTab === tab.id;
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
