import { BigCaloriesRing, ProgressRing, SectionTitle, PillButton } from "../components/ui";

const GOAL = { kcal: 2180, protein: 142, fat: 68, carbs: 240 };
const EATEN = { kcal: 1640, protein: 108, fat: 47, carbs: 180 };

const DIARY_ENTRIES = [
  { time: "08:15", name: "Завтрак",  items: "Овсянка, яйца варёные, кофе с молоком", kcal: 520, color: "#ffb347", emoji: "🌅" },
  { time: "13:10", name: "Обед",     items: "Куриная грудка, рис бурый, овощной салат",  kcal: 640, color: "#6c63ff", emoji: "☀️" },
  { time: "16:45", name: "Перекус",  items: "Творог 5% с ягодами, миндаль",          kcal: 350, color: "#00d9a3", emoji: "🍎" },
  { time: "19:30", name: "Ужин (план)", items: "Лосось, гречка, брокколи на пару",   kcal: 430, color: "#ff6584", emoji: "🌙", planned: true },
];

const REMAINING = {
  kcal:    GOAL.kcal    - EATEN.kcal,
  protein: GOAL.protein - EATEN.protein,
  fat:     GOAL.fat     - EATEN.fat,
  carbs:   GOAL.carbs   - EATEN.carbs,
};

export default function DiaryTab({ showToast }) {
  return (
    <div className="animate-fade-up">
      {/* КБЖУ hero */}
      <div
        className="rounded-2xl p-4 mb-3"
        style={{
          background: "linear-gradient(135deg, rgba(108,99,255,0.14), rgba(0,217,163,0.07))",
          border: "1px solid rgba(108,99,255,0.2)",
        }}
      >
        <div className="flex items-center gap-6">
          <BigCaloriesRing eaten={EATEN.kcal} goal={GOAL.kcal} />

          <div className="flex flex-col gap-3.5">
            <ProgressRing value={EATEN.protein} max={GOAL.protein} size={58} stroke={6} color="#ff6584" label="Белки" sub={`${EATEN.protein}г`} />
            <ProgressRing value={EATEN.fat}     max={GOAL.fat}     size={58} stroke={6} color="#ffb347" label="Жиры"  sub={`${EATEN.fat}г`} />
            <ProgressRing value={EATEN.carbs}   max={GOAL.carbs}   size={58} stroke={6} color="#6c63ff" label="Углев." sub={`${EATEN.carbs}г`} />
          </div>
        </div>

        {/* Remaining summary */}
        <div
          className="mt-4 pt-3 grid grid-cols-4 text-center"
          style={{ borderTop: "1px solid var(--tg-border)" }}
        >
          {[
            { label: "До цели", value: `${REMAINING.kcal} кк`, color: "#00d9a3" },
            { label: "Белки",   value: `${REMAINING.protein}г`, color: "#ff6584" },
            { label: "Жиры",    value: `${REMAINING.fat}г`,     color: "#ffb347" },
            { label: "Углев.",  value: `${REMAINING.carbs}г`,   color: "#6c63ff" },
          ].map((s) => (
            <div key={s.label}>
              <div className="text-[13px] font-extrabold" style={{ color: s.color }}>{s.value}</div>
              <div className="text-[10px] font-bold mt-0.5" style={{ color: "var(--tg-muted)" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <SectionTitle>Хронология</SectionTitle>

      {/* Timeline */}
      {DIARY_ENTRIES.map((entry, i) => (
        <div key={i} className="flex gap-3 mb-2">
          {/* Time column */}
          <div className="flex flex-col items-center w-10 flex-shrink-0">
            <div className="text-[11px] font-bold" style={{ color: "var(--tg-muted)" }}>{entry.time}</div>
            <div
              className="w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0"
              style={{ background: entry.color }}
            />
            {i < DIARY_ENTRIES.length - 1 && (
              <div className="flex-1 w-[2px] rounded-full my-1" style={{ background: "var(--tg-border)", minHeight: 16 }} />
            )}
          </div>

          {/* Card */}
          <div
            className="flex-1 rounded-xl px-3.5 py-3 mb-1"
            style={{
              background: entry.planned ? "transparent" : "var(--tg-surface)",
              border: entry.planned ? `1px dashed ${entry.color}50` : "1px solid var(--tg-border)",
              opacity: entry.planned ? 0.7 : 1,
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="text-[14px] font-bold flex items-center gap-1.5" style={{ color: "var(--tg-text)" }}>
                <span>{entry.emoji}</span>
                {entry.name}
              </div>
              <div className="text-[14px] font-extrabold" style={{ color: entry.color }}>{entry.kcal} кк</div>
            </div>
            <div className="text-[12px] leading-snug" style={{ color: "var(--tg-muted)" }}>{entry.items}</div>
          </div>
        </div>
      ))}

      <PillButton onClick={() => showToast("🍽️", "Добавляем приём пищи...")}>
        🍽️ Добавить приём пищи
      </PillButton>
    </div>
  );
}
