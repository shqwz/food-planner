import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../api/client";

const GOAL = { kcal: 2200, protein: 140, fat: 70, carbs: 230 };

export default function DiaryTab({ showToast, userId }) {
  const [diary, setDiary] = useState({ meals: [], totals: { kcal: 0, protein: 0, fat: 0, carbs: 0 } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGet("/api/diary", { user_id: userId })
      .then(setDiary)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [userId]);

  const eaten = useMemo(() => diary.totals || { kcal: 0, protein: 0, fat: 0, carbs: 0 }, [diary]);
  const remaining = useMemo(() => ({
    kcal: GOAL.kcal - eaten.kcal,
    protein: GOAL.protein - eaten.protein,
    fat: GOAL.fat - eaten.fat,
    carbs: GOAL.carbs - eaten.carbs,
  }), [eaten]);

  if (loading) return <div className="content"><div className="card" style={{ padding: 16 }}>Загружаем дневник...</div></div>;

  return (
    <div className="content">
      <div className="today-hero">
        <div className="hero-label">Итог дня</div>
        <div className="hero-title">{Math.round(eaten.kcal)} из {GOAL.kcal} ккал</div>
        <div className="macro-row">
          <div className="macro-pill"><div className="macro-val" style={{ color: "var(--c-accent)" }}>{Math.round(eaten.protein)}г</div><div className="macro-lab">Белки</div></div>
          <div className="macro-pill"><div className="macro-val" style={{ color: "var(--c-warn)" }}>{Math.round(eaten.fat)}г</div><div className="macro-lab">Жиры</div></div>
          <div className="macro-pill"><div className="macro-val" style={{ color: "var(--c-accent2)" }}>{Math.round(eaten.carbs)}г</div><div className="macro-lab">Углеводы</div></div>
        </div>
        <div className="kpi">До цели: {Math.round(remaining.kcal)} ккал</div>
      </div>
      {error && (
        <div className="card" style={{ padding: 12, color: "var(--c-danger)" }}>
          {error}
        </div>
      )}

      <div className="section-title">Хронология</div>

      {diary.meals.length === 0 ? (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 700 }}>Дневник пока пуст</div>
          <div className="muted">Добавь первый прием пищи, чтобы начать отслеживать прогресс.</div>
        </div>
      ) : diary.meals.map((entry, i) => (
        <div className="card" key={i}>
          <div className="list-item">
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{entry.meal_type}</div>
              <div className="kpi">{entry.dish_name}</div>
            </div>
            <div className="badge">{Math.round(entry.totals.kcal || 0)} ккал</div>
          </div>
        </div>
      ))}

      <button className="pill-btn pill-btn-primary" onClick={() => showToast("🍽️", "Добавляем приём пищи...")}>Добавить приём пищи</button>
    </div>
  );
}
