import { GlassCard, SectionTitle, MacroChip, PillButton } from "../components/ui";

const DAILY = { kcal: 2180, protein: 142, fat: 68, carbs: 240 };

const MEALS = [
  {
    id: 1, name: "Завтрак", time: "08:00", emoji: "🌅", color: "#ffb347",
    items: [
      { name: "Овсянка с бананом",   emoji: "🥣", kcal: 320 },
      { name: "Яйца варёные (2 шт)", emoji: "🥚", kcal: 155 },
      { name: "Кофе с молоком",      emoji: "☕", kcal:  45 },
    ],
    total_kcal: 520, protein: 28, fat: 14, carbs: 68,
  },
  {
    id: 2, name: "Обед", time: "13:00", emoji: "☀️", color: "#6c63ff",
    items: [
      { name: "Куриная грудка 150г", emoji: "🍗", kcal: 165 },
      { name: "Рис бурый 150г",      emoji: "🍚", kcal: 195 },
      { name: "Салат из овощей",     emoji: "🥗", kcal:  80 },
    ],
    total_kcal: 640, protein: 45, fat: 12, carbs: 82,
  },
  {
    id: 3, name: "Перекус", time: "16:30", emoji: "🍎", color: "#00d9a3",
    items: [
      { name: "Творог с ягодами", emoji: "🫐", kcal: 180 },
      { name: "Миндаль 30г",      emoji: "🌰", kcal: 170 },
    ],
    total_kcal: 350, protein: 20, fat: 16, carbs: 24,
  },
  {
    id: 4, name: "Ужин", time: "19:30", emoji: "🌙", color: "#ff6584",
    items: [
      { name: "Лосось 200г",      emoji: "🐟", kcal: 280 },
      { name: "Гречка 100г",      emoji: "🫘", kcal: 110 },
      { name: "Брокколи на пару", emoji: "🥦", kcal:  40 },
    ],
    total_kcal: 430, protein: 38, fat: 18, carbs: 28,
  },
];

export default function PlanTab({ showToast }) {
  return (
    <div className="animate-fade-up">
      {/* AI Plan summary card */}
      <GlassCard
        style={{
          background: "linear-gradient(135deg, rgba(108,99,255,0.15), rgba(0,217,163,0.08))",
          borderColor: "rgba(108,99,255,0.25)",
        }}
      >
        <div className="flex items-center gap-2.5 mb-3">
          <span className="text-[26px]">🤖</span>
          <div className="flex-1">
            <div className="text-[16px] font-extrabold" style={{ color: "var(--tg-text)" }}>ИИ-план на сегодня</div>
            <div className="text-[12px] mt-0.5" style={{ color: "var(--tg-muted)" }}>
              {DAILY.kcal} ккал · Сбалансированный рацион
            </div>
          </div>
          <div
            className="px-2.5 py-1 rounded-full text-[11px] font-bold"
            style={{ background: "rgba(0,217,163,0.15)", color: "#00d9a3" }}
          >
            АКТИВЕН
          </div>
        </div>

        {/* Macro grid */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Белки",   value: `${DAILY.protein}г`, color: "#ff6584" },
            { label: "Жиры",    value: `${DAILY.fat}г`,     color: "#ffb347" },
            { label: "Углев.",  value: `${DAILY.carbs}г`,   color: "#6c63ff" },
            { label: "Ккал",    value: DAILY.kcal,           color: "#00d9a3" },
          ].map((m) => (
            <div
              key={m.label}
              className="rounded-[10px] py-2.5 text-center"
              style={{ background: "var(--tg-surface)" }}
            >
              <div className="text-[16px] font-extrabold leading-none" style={{ color: m.color }}>{m.value}</div>
              <div className="text-[10px] font-bold mt-1" style={{ color: "var(--tg-muted)" }}>{m.label}</div>
            </div>
          ))}
        </div>
      </GlassCard>

      <SectionTitle>Приёмы пищи</SectionTitle>

      {MEALS.map((meal) => (
        <MealCard key={meal.id} meal={meal} showToast={showToast} />
      ))}

      <PillButton variant="outline" onClick={() => showToast("🔄", "Генерируем новый план...")}>
        🔄 Перегенерировать план
      </PillButton>
    </div>
  );
}

function MealCard({ meal, showToast }) {
  return (
    <div
      className="rounded-[20px] overflow-hidden mb-3"
      style={{ background: "var(--tg-surface)", border: "1px solid var(--tg-border)" }}
    >
      {/* Coloured top stripe */}
      <div className="h-[3px]" style={{ background: meal.color }} />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="text-[22px]">{meal.emoji}</span>
          <div>
            <div className="text-[16px] font-extrabold" style={{ color: "var(--tg-text)" }}>{meal.name}</div>
            <div className="text-[12px] font-semibold" style={{ color: "var(--tg-muted)" }}>{meal.time}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[20px] font-extrabold leading-none" style={{ color: meal.color }}>{meal.total_kcal}</div>
          <div className="text-[11px] mt-0.5" style={{ color: "var(--tg-muted)" }}>ккал</div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "var(--tg-border)", margin: "0 16px" }} />

      {/* Items */}
      <div className="px-4 py-3 flex flex-col gap-1.5">
        {meal.items.map((item, i) => (
          <div key={i} className="flex items-center justify-between text-[13px]">
            <div className="flex items-center gap-1.5 font-semibold" style={{ color: "var(--tg-text)" }}>
              <span>{item.emoji}</span>
              {item.name}
            </div>
            <div
              className="px-2 py-0.5 rounded-lg text-[11px] font-bold"
              style={{ background: "rgba(255,255,255,0.06)", color: "var(--tg-muted)" }}
            >
              {item.kcal} кк
            </div>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "var(--tg-border)", margin: "0 16px" }} />

      {/* Footer macros */}
      <div className="flex items-center gap-2 px-4 py-3 overflow-x-auto">
        <MacroChip label="Б" value={`${meal.protein}г`} color="#ff6584" />
        <MacroChip label="Ж" value={`${meal.fat}г`}    color="#ffb347" />
        <MacroChip label="У" value={`${meal.carbs}г`}  color="#6c63ff" />
        <button
          onClick={() => showToast("✅", "Отмечено как съеденное!")}
          className="ml-auto px-3 py-1.5 rounded-full text-[12px] font-bold cursor-pointer border transition-all active:scale-95"
          style={{
            background: "rgba(0,217,163,0.12)",
            borderColor: "rgba(0,217,163,0.3)",
            color: "#00d9a3",
          }}
        >
          ✓ Съел
        </button>
      </div>
    </div>
  );
}
