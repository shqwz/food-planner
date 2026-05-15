import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet } from "../api/client";
import PantryTab from "../tabs/PantryTab";
import ShoppingTab from "../tabs/ShoppingTab";

const SUB_TABS = [
  {
    id: "home",
    label: "Дома",
    icon: (
      <svg className="stock-tab__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <path d="M5 7h14M5 11h8M5 15h5" strokeLinecap="round" />
        <rect x="5" y="3" width="14" height="18" rx="2" />
      </svg>
    ),
  },
  {
    id: "buy",
    label: "Купить",
    icon: (
      <svg className="stock-tab__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <path d="M6 6h15l-1.5 9h-11L5 3H2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="9" cy="20" r="1.25" fill="currentColor" stroke="none" />
        <circle cx="17" cy="20" r="1.25" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
];

export default function StockScreen({ userId, showToast }) {
  const [sub, setSub] = useState("home");
  const defaultPickedRef = useRef(false);

  const refreshShoppingState = useCallback(async () => {
    if (userId == null || userId === "") return;
    try {
      const data = await apiGet("/api/shopping", { user_id: userId, days: 2 });
      const n = data?.empty ? 0 : (data?.items?.length ?? 0);
      if (!defaultPickedRef.current && n > 0) {
        defaultPickedRef.current = true;
        setSub("buy");
      }
    } catch {
      /* ignore */
    }
  }, [userId]);

  useEffect(() => {
    defaultPickedRef.current = false;
    setSub("home");
    refreshShoppingState();
  }, [userId, refreshShoppingState]);

  return (
    <div className="stock-screen">
      <div className="stock-segment" role="tablist" aria-label="Запасы">
        {SUB_TABS.map((t) => {
          const active = sub === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`stock-tab${active ? " stock-tab--active" : ""}`}
              onClick={() => setSub(t.id)}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      <div className="stock-screen__body">
        <div hidden={sub !== "home"} className="stock-screen__pane">
          <PantryTab userId={userId} showToast={showToast} embedded />
        </div>
        <div hidden={sub !== "buy"} className="stock-screen__pane">
          <ShoppingTab
            userId={userId}
            showToast={showToast}
            embedded
            active={sub === "buy"}
            onTripComplete={() => {
              setSub("home");
              refreshShoppingState();
            }}
            onCartChange={refreshShoppingState}
          />
        </div>
      </div>
    </div>
  );
}
