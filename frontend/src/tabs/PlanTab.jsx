import { useEffect, useState } from "react";
import { GlassCard, SectionTitle, MacroChip, PillButton } from "../components/ui";
import { apiGet, apiPost } from "../api/client";

export default function PlanTab({ showToast, userId }) {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadPlan = async () => {
      try {
        setLoading(true);
        setError("");
        const result = await apiGet("/api/plan", { user_id: userId });
        setPlan(result.exists ? result : null);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    loadPlan();
  }, [userId]);

  const generate = async () => {
    try {
      await apiPost("/api/plan/generate", { user_id: userId });
      showToast("✅", "План сгенерирован");
      const result = await apiGet("/api/plan", { user_id: userId });
      setPlan(result.exists ? result : null);
    } catch (e) {
      showToast("⚠️", e.message);
    }
  };

  if (loading) {
    return <div className="text-sm" style={{ color: "var(--tg-muted)" }}>Загружаем план...</div>;
  }

  const daily = plan?.daily_totals || {};
  const meals = plan?.meals || [];

  return (
    <div className="animate-fade-up">
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
              {plan ? `${daily.kcal || 0} ккал` : "План не найден"}
            </div>
          </div>
          <div
            className="px-2.5 py-1 rounded-full text-[11px] font-bold"
            style={{ background: "rgba(0,217,163,0.15)", color: "#00d9a3" }}
          >
            {plan ? "АКТИВЕН" : "ПУСТО"}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Белки",   value: `${daily.protein || 0}г`, color: "#ff6584" },
            { label: "Жиры",    value: `${daily.fat || 0}г`,     color: "#ffb347" },
            { label: "Углев.",  value: `${daily.carbs || 0}г`,   color: "#6c63ff" },
            { label: "Ккал",    value: daily.kcal || 0,          color: "#00d9a3" },
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

      {error && <div className="text-sm mb-2" style={{ color: "#ff6584" }}>{error}</div>}
      <SectionTitle>Приёмы пищи</SectionTitle>

      {meals.map((meal, idx) => (
        <MealCard key={`${meal.type}-${idx}`} meal={meal} showToast={showToast} />
      ))}

      <PillButton variant="outline" onClick={generate}>
        🔄 Перегенерировать план
      </PillButton>
    </div>
  );
}

function MealCard({ meal, showToast }) {
  const mealColor = "#6c63ff";
  return (
    <div
      className="rounded-[20px] overflow-hidden mb-3"
      style={{ background: "var(--tg-surface)", border: "1px solid var(--tg-border)" }}
    >
      {/* Coloured top stripe */}
      <div className="h-[3px]" style={{ background: mealColor }} />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="text-[22px]">🍽️</span>
          <div>
            <div className="text-[16px] font-extrabold" style={{ color: "var(--tg-text)" }}>{meal.dish_name || meal.type}</div>
            <div className="text-[12px] font-semibold" style={{ color: "var(--tg-muted)" }}>{meal.time}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[20px] font-extrabold leading-none" style={{ color: mealColor }}>{meal.total_kcal || 0}</div>
          <div className="text-[11px] mt-0.5" style={{ color: "var(--tg-muted)" }}>ккал</div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "var(--tg-border)", margin: "0 16px" }} />

      {/* Items */}
      <div className="px-4 py-3 flex flex-col gap-1.5">
        {(meal.ingredients || []).map((item, i) => (
          <div key={i} className="flex items-center justify-between text-[13px]">
            <div className="flex items-center gap-1.5 font-semibold" style={{ color: "var(--tg-text)" }}>
              {item.name}
            </div>
            <div
              className="px-2 py-0.5 rounded-lg text-[11px] font-bold"
              style={{ background: "rgba(255,255,255,0.06)", color: "var(--tg-muted)" }}
            >
              {item.amount} {item.unit}
            </div>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "var(--tg-border)", margin: "0 16px" }} />

      {/* Footer macros */}
      <div className="flex items-center gap-2 px-4 py-3 overflow-x-auto">
        <MacroChip label="Б" value={`${meal.total_protein || 0}г`} color="#ff6584" />
        <MacroChip label="Ж" value={`${meal.total_fat || 0}г`}    color="#ffb347" />
        <MacroChip label="У" value={`${meal.total_carbs || 0}г`}  color="#6c63ff" />
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
