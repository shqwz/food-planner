import { useState } from "react";
import { GlassCard, SectionTitle, PillButton } from "../components/ui";

const INITIAL_ITEMS = [
  { name: "Куриная грудка", amount: "1 кг",    price: 320, emoji: "🍗", checked: false },
  { name: "Лосось с/м",     amount: "500 г",   price: 480, emoji: "🐟", checked: false },
  { name: "Яйца С1",        amount: "30 шт",   price: 195, emoji: "🥚", checked: true  },
  { name: "Творог 5%",      amount: "2×500 г", price: 220, emoji: "🧀", checked: false },
  { name: "Авокадо",        amount: "4 шт",    price: 280, emoji: "🥑", checked: false },
  { name: "Брокколи зам.",  amount: "900 г",   price: 195, emoji: "🥦", checked: true  },
  { name: "Миндаль",        amount: "200 г",   price: 240, emoji: "🌰", checked: false },
  { name: "Рис бурый",      amount: "1 кг",    price: 180, emoji: "🌾", checked: false },
];

export default function ShoppingTab({ showToast }) {
  const [items, setItems] = useState(INITIAL_ITEMS);

  const toggle = (i) => {
    setItems((prev) => prev.map((item, idx) => idx === i ? { ...item, checked: !item.checked } : item));
  };

  const remaining  = items.filter((i) => !i.checked);
  const bought     = items.filter((i) =>  i.checked);
  const totalPrice = items.reduce((sum, i) => sum + (i.checked ? 0 : i.price), 0);
  const allDone    = remaining.length === 0;

  return (
    <div className="animate-fade-up">
      {/* Summary card */}
      <GlassCard className="flex items-center justify-between">
        <div>
          <div className="text-[12px] font-bold" style={{ color: "var(--tg-muted)" }}>Осталось купить</div>
          <div className="text-[24px] font-extrabold leading-tight" style={{ color: "var(--tg-text)" }}>
            {allDone ? "Всё куплено! 🎉" : `${remaining.length} позиций`}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[12px] font-bold" style={{ color: "var(--tg-muted)" }}>Примерная сумма</div>
          <div className="text-[24px] font-extrabold leading-tight" style={{ color: "#00d9a3" }}>
            ~{totalPrice.toLocaleString("ru-RU")} ₽
          </div>
        </div>
      </GlassCard>

      {/* Remaining items */}
      {remaining.length > 0 && (
        <>
          <SectionTitle>Нужно купить</SectionTitle>
          {remaining.map((item) => {
            const idx = items.indexOf(item);
            return <ShopItem key={idx} item={item} onToggle={() => toggle(idx)} />;
          })}
        </>
      )}

      {/* Bought items */}
      {bought.length > 0 && (
        <>
          <SectionTitle>Уже куплено ✓</SectionTitle>
          {bought.map((item) => {
            const idx = items.indexOf(item);
            return <ShopItem key={idx} item={item} onToggle={() => toggle(idx)} />;
          })}
        </>
      )}

      <PillButton variant="outline" onClick={() => showToast("📤", "Список скопирован!")}>
        📤 Поделиться списком
      </PillButton>

      {allDone && (
        <PillButton onClick={() => showToast("✅", "Корзина сброшена!")}>
          🛒 Новая корзина
        </PillButton>
      )}
    </div>
  );
}

function ShopItem({ item, onToggle }) {
  return (
    <div
      onClick={onToggle}
      className="flex items-center gap-3 px-4 py-3 rounded-xl mb-2 cursor-pointer transition-all active:scale-[0.97]"
      style={{
        background: item.checked ? "rgba(255,255,255,0.02)" : "var(--tg-surface)",
        border: "1px solid var(--tg-border)",
        opacity: item.checked ? 0.55 : 1,
      }}
    >
      {/* Checkbox */}
      <div
        className="w-[22px] h-[22px] rounded-[7px] flex items-center justify-center flex-shrink-0 transition-all"
        style={{
          border: item.checked ? "none" : "2px solid var(--tg-border)",
          background: item.checked ? "#00d9a3" : "transparent",
        }}
      >
        {item.checked && <span className="text-[13px] font-bold text-white">✓</span>}
      </div>

      <span className="text-[20px]">{item.emoji}</span>

      <div className="flex-1">
        <div
          className="text-[14px] font-bold"
          style={{
            color: "var(--tg-text)",
            textDecoration: item.checked ? "line-through" : "none",
          }}
        >
          {item.name}
        </div>
        <div className="text-[12px] mt-0.5" style={{ color: "var(--tg-muted)" }}>{item.amount}</div>
      </div>

      <div className="text-[13px] font-bold flex-shrink-0" style={{ color: "var(--tg-muted)" }}>
        {item.price} ₽
      </div>
    </div>
  );
}
