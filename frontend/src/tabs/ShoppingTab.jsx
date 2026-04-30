import { useEffect, useState } from "react";
import { apiGet } from "../api/client";

export default function ShoppingTab({ showToast, userId }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGet("/api/shopping", { user_id: userId, days: 3 })
      .then((data) => setItems((data.items || []).map((item) => ({ ...item, checked: false })))
      )
      .catch((e) => setError(e.message));
  }, [userId]);

  const toggle = (i) => {
    setItems((prev) => prev.map((item, idx) => idx === i ? { ...item, checked: !item.checked } : item));
  };

  const remaining  = items.filter((i) => !i.checked);
  const bought     = items.filter((i) =>  i.checked);
  const totalPrice = items.reduce((sum, i) => sum + (i.checked ? 0 : i.estimated_cost), 0);
  const allDone    = remaining.length === 0;

  return (
    <div className="content">
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div className="kpi">Осталось купить</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>
            {allDone ? "Всё куплено! 🎉" : `${remaining.length} позиций`}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="kpi">Сумма</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--c-accent)" }}>
            ~{totalPrice.toLocaleString("ru-RU")} ₽
            </div>
          </div>
        </div>
      </div>
      {error && (
        <div className="card" style={{ padding: 12, color: "var(--c-danger)" }}>
          {error}
        </div>
      )}

      {items.length === 0 && !error && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 700 }}>Корзина пока пуста</div>
          <div className="muted">Сгенерируй план, чтобы получить список покупок.</div>
        </div>
      )}

      {remaining.length > 0 && (
        <>
          <div className="section-title">Нужно купить</div>
          <div className="card">
            {remaining.map((item) => {
              const idx = items.indexOf(item);
              return <ShopItem key={idx} item={item} onToggle={() => toggle(idx)} />;
            })}
          </div>
        </>
      )}

      {bought.length > 0 && (
        <>
          <div className="section-title">Уже куплено</div>
          <div className="card">
            {bought.map((item) => {
              const idx = items.indexOf(item);
              return <ShopItem key={idx} item={item} onToggle={() => toggle(idx)} />;
            })}
          </div>
        </>
      )}

      <button className="pill-btn pill-btn-ghost" onClick={() => showToast("📤", "Список скопирован!")}>Поделиться списком</button>

      {allDone && (
        <button className="pill-btn pill-btn-primary" onClick={() => showToast("✅", "Корзина сброшена!")}>Новая корзина</button>
      )}
    </div>
  );
}

function ShopItem({ item, onToggle }) {
  return (
    <div onClick={onToggle} className="list-item" style={{ opacity: item.checked ? 0.5 : 1 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, textDecoration: item.checked ? "line-through" : "none" }}>{item.name}</div>
        <div className="kpi">{item.amount_needed} {item.unit}</div>
      </div>
      <div className="kpi">
        {Math.round(item.estimated_cost)} ₽
      </div>
    </div>
  );
}
