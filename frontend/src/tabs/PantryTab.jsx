import { useState, useMemo } from "react";
import { Card, ProgressBar, PillButton, SectionTitle, SkeletonList, EmptyState } from "../components/ui";

// Mock data — replace with real API fetch
const PRODUCTS = [
  { id: 1, name: "Куриная грудка", emoji: "🍗", amount: 420, unit: "г", max: 600, kcal: "110 ккал/100г", cat: "protein", color: "#ff6584" },
  { id: 2, name: "Яйца С1",        emoji: "🥚", amount: 10,  unit: "шт", max: 12, kcal: "155 ккал/100г", cat: "protein", color: "#ffb347" },
  { id: 3, name: "Рис бурый",      emoji: "🌾", amount: 850, unit: "г", max: 1500, kcal: "360 ккал/100г", cat: "carb",    color: "#6c63ff" },
  { id: 4, name: "Гречка",         emoji: "🫘", amount: 600, unit: "г", max: 1500, kcal: "330 ккал/100г", cat: "carb",    color: "#6c63ff" },
  { id: 5, name: "Брокколи",       emoji: "🥦", amount: 300, unit: "г", max: 400,  kcal: "34 ккал/100г",  cat: "veg",     color: "#00d9a3" },
  { id: 6, name: "Авокадо",        emoji: "🥑", amount: 2,   unit: "шт", max: 3,   kcal: "160 ккал/100г", cat: "veg",     color: "#00d9a3" },
  { id: 7, name: "Творог 5%",      emoji: "🧀", amount: 500, unit: "г", max: 1000, kcal: "121 ккал/100г", cat: "dairy",   color: "#64b5f6" },
  { id: 8, name: "Молоко 3.2%",    emoji: "🥛", amount: 1,   unit: "л", max: 1,    kcal: "60 ккал/100мл", cat: "dairy",   color: "#64b5f6" },
  { id: 9, name: "Овсяные хлопья", emoji: "🌾", amount: 400, unit: "г", max: 800,  kcal: "380 ккал/100г", cat: "carb",    color: "#6c63ff" },
  { id: 10, name: "Лосось с/м",    emoji: "🐟", amount: 400, unit: "г", max: 1000, kcal: "208 ккал/100г", cat: "protein", color: "#ff6584" },
];

const TAGS = [
  { id: "all",     label: "Все" },
  { id: "protein", label: "🥩 Белки" },
  { id: "carb",    label: "🌾 Углеводы" },
  { id: "veg",     label: "🥦 Овощи" },
  { id: "dairy",   label: "🥛 Молочное" },
];

function getLevelLabel(pct) {
  if (pct > 75) return { text: "Много",  color: "#00d9a3" };
  if (pct > 35) return { text: "Норм",   color: "#6c63ff" };
  return                { text: "Мало",  color: "#ff6584" };
}

export default function PantryTab({ showToast, loading = false }) {
  const [query, setQuery]   = useState("");
  const [tag, setTag]       = useState("all");

  const filtered = useMemo(() => {
    return PRODUCTS.filter((p) => {
      const matchTag   = tag === "all" || p.cat === tag;
      const matchQuery = p.name.toLowerCase().includes(query.toLowerCase());
      return matchTag && matchQuery;
    });
  }, [query, tag]);

  if (loading) return <SkeletonList count={6} />;

  return (
    <div className="animate-fade-up">
      {/* Search */}
      <div
        className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 mb-4"
        style={{ background: "var(--tg-surface)", border: "1px solid var(--tg-border)" }}
      >
        <span className="text-[16px]">🔍</span>
        <input
          type="text"
          placeholder="Поиск продуктов..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 bg-transparent outline-none text-[14px] font-semibold placeholder-[var(--tg-muted)]"
          style={{ color: "var(--tg-text)", fontFamily: "inherit", border: "none" }}
        />
        {query && (
          <button onClick={() => setQuery("")} className="text-[14px] cursor-pointer" style={{ color: "var(--tg-muted)", background: "none", border: "none" }}>✕</button>
        )}
      </div>

      {/* Category tags */}
      <div className="flex gap-2 flex-wrap mb-4">
        {TAGS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTag(t.id)}
            className="px-3 py-1.5 rounded-full text-[12px] font-bold cursor-pointer transition-all border"
            style={{
              background: tag === t.id ? "rgba(108,99,255,0.14)" : "none",
              borderColor: tag === t.id ? "var(--tg-accent)" : "var(--tg-border)",
              color: tag === t.id ? "var(--tg-accent)" : "var(--tg-muted)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Products */}
      {filtered.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="Ничего не найдено"
          desc="Попробуйте изменить запрос или категорию"
        />
      ) : (
        filtered.map((p) => {
          const pct = Math.round((p.amount / p.max) * 100);
          const lv  = getLevelLabel(pct);
          return (
            <div
              key={p.id}
              className="flex items-center gap-3 rounded-2xl px-4 py-3.5 mb-2 transition-transform active:scale-[0.98] cursor-pointer"
              style={{ background: "var(--tg-surface)", border: "1px solid var(--tg-border)" }}
              onClick={() => showToast("✏️", `Редактировать: ${p.name}`)}
            >
              {/* Icon */}
              <div
                className="w-11 h-11 rounded-[12px] flex items-center justify-center text-[22px] flex-shrink-0"
                style={{ background: `${p.color}18` }}
              >
                {p.emoji}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-bold truncate" style={{ color: "var(--tg-text)" }}>{p.name}</div>
                <div className="text-[12px] mt-0.5" style={{ color: "var(--tg-muted)" }}>{p.kcal}</div>
                <ProgressBar value={p.amount} max={p.max} color={p.color} />
              </div>

              {/* Amount badge */}
              <div className="flex-shrink-0 text-right">
                <div className="text-[13px] font-extrabold" style={{ color: "var(--tg-text)" }}>
                  {p.amount} {p.unit}
                </div>
                <div
                  className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold"
                  style={{ background: `${lv.color}20`, color: lv.color }}
                >
                  {lv.text}
                </div>
              </div>
            </div>
          );
        })
      )}

      <PillButton onClick={() => showToast("➕", "Открываем форму добавления...")}>
        ➕ Добавить продукт
      </PillButton>
    </div>
  );
}
