import { useEffect, useMemo, useState } from "react";
import { BigCaloriesRing, ProgressRing, SectionTitle, PillButton } from "../components/ui";
import { apiGet } from "../api/client";

const GOAL = { kcal: 2200, protein: 140, fat: 70, carbs: 230 };

export default function DiaryTab({ showToast, userId }) {
  const [diary, setDiary] = useState({ meals: [], totals: { kcal: 0, protein: 0, fat: 0, carbs: 0 } });

  useEffect(() => {
    apiGet("/api/diary", { user_id: userId })
      .then(setDiary)
      .catch(() => {});
  }, [userId]);

  const eaten = useMemo(() => diary.totals || { kcal: 0, protein: 0, fat: 0, carbs: 0 }, [diary]);
  const remaining = useMemo(() => ({
    kcal: GOAL.kcal - eaten.kcal,
    protein: GOAL.protein - eaten.protein,
    fat: GOAL.fat - eaten.fat,
    carbs: GOAL.carbs - eaten.carbs,
  }), [eaten]);

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
          <BigCaloriesRing eaten={eaten.kcal} goal={GOAL.kcal} />

          <div className="flex flex-col gap-3.5">
            <ProgressRing value={eaten.protein} max={GOAL.protein} size={58} stroke={6} color="#ff6584" label="Белки" sub={`${Math.round(eaten.protein)}г`} />
            <ProgressRing value={eaten.fat}     max={GOAL.fat}     size={58} stroke={6} color="#ffb347" label="Жиры"  sub={`${Math.round(eaten.fat)}г`} />
            <ProgressRing value={eaten.carbs}   max={GOAL.carbs}   size={58} stroke={6} color="#6c63ff" label="Углев." sub={`${Math.round(eaten.carbs)}г`} />
          </div>
        </div>

        {/* Remaining summary */}
        <div
          className="mt-4 pt-3 grid grid-cols-4 text-center"
          style={{ borderTop: "1px solid var(--tg-border)" }}
        >
          {[
            { label: "До цели", value: `${Math.round(remaining.kcal)} кк`, color: "#00d9a3" },
            { label: "Белки",   value: `${Math.round(remaining.protein)}г`, color: "#ff6584" },
            { label: "Жиры",    value: `${Math.round(remaining.fat)}г`,     color: "#ffb347" },
            { label: "Углев.",  value: `${Math.round(remaining.carbs)}г`,   color: "#6c63ff" },
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
      {diary.meals.map((entry, i) => (
        <div key={i} className="flex gap-3 mb-2">
          {/* Time column */}
          <div className="flex flex-col items-center w-10 flex-shrink-0">
            <div className="text-[11px] font-bold" style={{ color: "var(--tg-muted)" }}>{entry.time}</div>
            <div
              className="w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0"
              style={{ background: entry.color }}
            />
            {i < diary.meals.length - 1 && (
              <div className="flex-1 w-[2px] rounded-full my-1" style={{ background: "var(--tg-border)", minHeight: 16 }} />
            )}
          </div>

          {/* Card */}
          <div
            className="flex-1 rounded-xl px-3.5 py-3 mb-1"
            style={{
              background: entry.was_planned ? "transparent" : "var(--tg-surface)",
              border: entry.was_planned ? "1px dashed #6c63ff50" : "1px solid var(--tg-border)",
              opacity: entry.was_planned ? 0.7 : 1,
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="text-[14px] font-bold flex items-center gap-1.5" style={{ color: "var(--tg-text)" }}>
                {entry.meal_type}
              </div>
              <div className="text-[14px] font-extrabold" style={{ color: "#6c63ff" }}>{Math.round(entry.totals.kcal || 0)} кк</div>
            </div>
            <div className="text-[12px] leading-snug" style={{ color: "var(--tg-muted)" }}>{entry.dish_name}</div>
          </div>
        </div>
      ))}

      <PillButton onClick={() => showToast("🍽️", "Добавляем приём пищи...")}>
        🍽️ Добавить приём пищи
      </PillButton>
    </div>
  );
}
