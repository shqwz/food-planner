import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "../api/client";

export default function PlanTab({ showToast, userId }) {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const resolvePlan = useCallback(async () => {
    const todayResult = await apiGet("/api/plan", { user_id: userId });
    if (todayResult.exists) return todayResult;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    const tomorrowResult = await apiGet("/api/plan", { user_id: userId, date: tomorrowStr });
    return tomorrowResult.exists ? tomorrowResult : null;
  }, [userId]);

  useEffect(() => {
    const loadPlan = async () => {
      try {
        setLoading(true);
        setError("");
        const result = await resolvePlan();
        setPlan(result);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    loadPlan();
  }, [resolvePlan]);

  const generate = async () => {
    try {
      await apiPost("/api/plan/generate", {
        user_id: userId,
        planner: {
          meals_count: "auto",
          sleep_quality: "normal",
          overeating_event: null,
        },
      });
      showToast("✅", "План сгенерирован");
      const result = await resolvePlan();
      setPlan(result);
    } catch (e) {
      showToast("⚠️", e.message);
    }
  };

  if (loading) return <div className="content"><div className="card" style={{ padding: 16 }}>Загружаем план...</div></div>;

  const daily = plan?.daily_totals || {};
  const meals = plan?.meals || [];
  const nextMeal = meals[0];

  return (
    <div className="content">
      <section className="today-hero">
        <div className="hero-label">Ваш план на сегодня</div>
        <div className="hero-title">{daily.kcal || 0} из 2100 ккал</div>
        <div className="hero-sub">{nextMeal ? `Следующий прием: ${nextMeal.time || "--:--"}` : "План пока отсутствует"}</div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${Math.min(100, Math.round(((daily.kcal || 0) / 2100) * 100))}%` }} />
        </div>
        <div className="macro-row">
          {[
            { label: "Белки", value: `${Math.round(daily.protein || 0)}г`, color: "var(--c-accent)" },
            { label: "Жиры", value: `${Math.round(daily.fat || 0)}г`, color: "var(--c-warn)" },
            { label: "Углеводы", value: `${Math.round(daily.carbs || 0)}г`, color: "var(--c-accent2)" },
          ].map((m) => (
            <div className="macro-pill" key={m.label}>
              <div className="macro-val" style={{ color: m.color }}>{m.value}</div>
              <div className="macro-lab">{m.label}</div>
            </div>
          ))}
        </div>
      </section>

      {error && <div className="card" style={{ padding: 14, color: "var(--c-danger)" }}>{error}</div>}
      <div className="section-title">Приемы пищи</div>

      {meals.length === 0 ? (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 700 }}>План на сегодня пока пуст</div>
          <div className="muted">Сгенерируй рацион, чтобы получить расписание и контроль КБЖУ.</div>
        </div>
      ) : (
        <div className="card">
          {meals.map((meal, idx) => <MealRow key={`${meal.type}-${idx}`} meal={meal} showToast={showToast} />)}
        </div>
      )}

      <button className="pill-btn pill-btn-primary" onClick={generate}>
        {plan ? "Обновить план" : "Сгенерировать план"}
      </button>
    </div>
  );
}

function MealRow({ meal, showToast }) {
  return (
    <div className="list-item">
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{meal.dish_name || meal.type}</div>
        <div className="kpi">{meal.time} · {meal.total_kcal || 0} ккал</div>
      </div>
      <button className="pill-btn pill-btn-ghost" style={{ width: "auto", padding: "7px 10px" }} onClick={() => showToast("✅", "Отмечено")}>
        ✓
      </button>
    </div>
  );
}
