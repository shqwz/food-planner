import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "../api/client";
import PlanMenuModal from "./PlanMenuModal";
import { IconMoreHorizontal } from "../components/ui-icons";

const MEAL_LABEL = {
  breakfast: "Завтрак",
  lunch: "Обед",
  dinner: "Ужин",
  snack: "Перекус",
};

/** Цель по калориям/БЖУ, если на дату нет строки плана в БД */
const FALLBACK_DAY_GOALS = { kcal: 2100, protein: 140, fat: 70, carbs: 230 };

function parseMealTime(m) {
  const raw = (m && m.time) || "12:00";
  const [h, mi] = String(raw).split(":").map((x) => parseInt(x, 10));
  const hh = Number.isFinite(h) ? h : 12;
  const mm = Number.isFinite(mi) ? mi : 0;
  return hh * 60 + mm;
}

function sortMealsByTime(meals) {
  return [...(meals || [])].sort((a, b) => parseMealTime(a) - parseMealTime(b));
}

function mskTodayIso() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function daysBetweenInclusive(isoFrom, isoTo) {
  const a = new Date(`${isoFrom}T12:00:00`);
  const b = new Date(`${isoTo}T12:00:00`);
  return Math.round((b - a) / 86400000);
}

function formatPlanHeader(iso) {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
}

function capFirst(str) {
  if (!str) return "";
  return str.replace(/^./, (c) => c.toUpperCase());
}

function planWeekdayLabel(iso) {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  return capFirst(d.toLocaleDateString("ru-RU", { weekday: "long" }));
}

function planDayNumber(iso) {
  if (!iso) return "";
  return new Date(`${iso}T12:00:00`).getDate();
}

export default function PlanTab({ showToast, userId }) {
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [extendDismissed, setExtendDismissed] = useState(false);
  const [diaryTotals, setDiaryTotals] = useState({ kcal: 0, protein: 0, fat: 0, carbs: 0 });

  const loadWindow = useCallback(async () => {
    setError("");
    const data = await apiGet("/api/plan/window", { user_id: userId, days: 14 });
    const list = data.days || [];
    setDays(list);
    const firstWith = list.findIndex((d) => d.exists);
    const idx = firstWith >= 0 ? firstWith : 0;
    setActiveIdx(idx);
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
      loadWindow()
        .catch((e) => {
          if (!cancelled) setError(e.message);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [loadWindow]);

  useEffect(() => {
    if (loading || userId == null || userId === "" || !days.length) return;
    const cur = days[activeIdx] || {};
    const date = cur.plan_date || mskTodayIso();
    let cancelled = false;
    setDiaryTotals({ kcal: 0, protein: 0, fat: 0, carbs: 0 });
    apiGet("/api/diary", { user_id: userId, date: date })
      .then((payload) => {
        if (!cancelled) setDiaryTotals(payload.totals || { kcal: 0, protein: 0, fat: 0, carbs: 0 });
      })
      .catch(() => {
        if (!cancelled) setDiaryTotals({ kcal: 0, protein: 0, fat: 0, carbs: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, activeIdx, days, loading]);

  const current = days[activeIdx] || {};
  const anchorDate = current.plan_date || mskTodayIso();

  const existingDates = days.filter((d) => d.exists).map((d) => d.plan_date);
  const lastPlan = existingDates.length ? existingDates.sort().slice(-1)[0] : null;
  const todayMsk = mskTodayIso();
  const daysLeft =
    lastPlan != null ? Math.max(0, daysBetweenInclusive(todayMsk, lastPlan)) : null;
  const showExtend =
    !extendDismissed && daysLeft != null && daysLeft <= 3 && lastPlan != null;

  const runGenerate = async (payload) => {
    await apiPost("/api/plan/generate", {
      user_id: userId,
      planner: {
        meals_count: "auto",
        sleep_quality: "normal",
        overeating_event: null,
      },
      ...payload,
    });
    showToast("План обновлён", "success");
    await loadWindow();
  };

  const handleMenuConfirm = async ({ period, start_from }) => {
    try {
      const body = { period };
      if (period === "week") {
        // сервер: неделя от завтра (МСК), если не передать start_from
      } else if (start_from) {
        body.start_from = start_from;
      }
      await runGenerate(body);
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  const extendPlan = async () => {
    try {
      await runGenerate({ period: "week" });
      setExtendDismissed(true);
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  if (loading) {
    return (
      <div className="content">
        <div className="card" style={{ padding: 16 }}>
          Загружаем план…
        </div>
      </div>
    );
  }

  const daily = current.daily_totals || {};
  const meals = current.meals || [];
  const mealsSorted = sortMealsByTime(meals);

  const eaten = {
    kcal: Number(diaryTotals.kcal) || 0,
    protein: Number(diaryTotals.protein) || 0,
    fat: Number(diaryTotals.fat) || 0,
    carbs: Number(diaryTotals.carbs) || 0,
  };
  const goals = current.exists
    ? {
        kcal: Math.max(1, Math.round(Number(daily.kcal) || FALLBACK_DAY_GOALS.kcal)),
        protein: Math.max(1, Math.round(Number(daily.protein) || FALLBACK_DAY_GOALS.protein)),
        fat: Math.max(1, Math.round(Number(daily.fat) || FALLBACK_DAY_GOALS.fat)),
        carbs: Math.max(1, Math.round(Number(daily.carbs) || FALLBACK_DAY_GOALS.carbs)),
      }
    : FALLBACK_DAY_GOALS;
  const kcalPct = Math.min(100, Math.round((eaten.kcal / goals.kcal) * 100));

  return (
    <div className="content">
      {showExtend && (
        <div
          className="card"
          style={{
            padding: 14,
            marginBottom: 12,
            borderColor: "var(--c-warn)",
            background: "var(--c-surface2)",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            План заканчивается через {daysLeft} {daysLeft === 1 ? "день" : "дня"}.
          </div>
          <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
            Продлить на неделю вперёд?
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="pill-btn pill-btn-primary" onClick={extendPlan}>
              Да
            </button>
            <button type="button" className="pill-btn pill-btn-ghost" onClick={() => setExtendDismissed(true)}>
              Позже
            </button>
          </div>
        </div>
      )}

      <section className="plan-day-picker" aria-labelledby="plan-day-picker-heading">
        <div className="plan-day-picker__head">
          <div className="plan-day-picker__intro">
            <p className="plan-day-picker__weekday" id="plan-day-picker-heading">
              {planWeekdayLabel(anchorDate)}
            </p>
            <span
              className={`plan-day-picker__pill${
                !current.exists
                  ? " plan-day-picker__pill--empty"
                  : current.day_type === "training"
                    ? " plan-day-picker__pill--training"
                    : " plan-day-picker__pill--rest"
              }`}
            >
              {!current.exists ? "Нет плана" : current.day_type === "training" ? "Тренировка" : "Отдых"}
            </span>
          </div>
          <button type="button" className="icon-btn icon-btn--svg plan-day-picker__menu" aria-label="Меню плана" onClick={() => setMenuOpen(true)}>
            <IconMoreHorizontal size={20} />
          </button>
        </div>
        <div className="plan-day-rail" role="tablist" aria-label="Дни в окне плана">
          {days.map((d, i) => {
            const isToday = d.plan_date === todayMsk;
            return (
              <button
                key={d.plan_date}
                type="button"
                role="tab"
                aria-selected={i === activeIdx}
                aria-label={formatPlanHeader(d.plan_date)}
                className={`plan-day-node${i === activeIdx ? " plan-day-node--active" : ""}${d.exists ? " plan-day-node--has" : " plan-day-node--empty"}${isToday ? " plan-day-node--today" : ""}`}
                onClick={() => setActiveIdx(i)}
              >
                <span className="plan-day-node__num" aria-hidden>
                  {planDayNumber(d.plan_date)}
                </span>
                <span className="plan-day-node__dot" aria-hidden />
              </button>
            );
          })}
        </div>
      </section>

      <section
        className="today-hero"
        style={{ marginTop: 12 }}
        aria-label={`Съедено по дневнику ${Math.round(eaten.kcal)} из ${goals.kcal} ккал`}
      >
        <div className="hero-title">
          {Math.round(eaten.kcal)} из {goals.kcal} ккал
        </div>
        <p className="hero-kpi-note muted">Съедено по дневнику</p>
        {(!current.exists || meals.length === 0) && (
          <div className="hero-sub">
            {!current.exists ? "Нет плана на эту дату" : "В плане нет приёмов"}
          </div>
        )}
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${kcalPct}%` }} />
        </div>
        <div className="macro-row">
          {[
            {
              label: "Белки",
              value: `${Math.round(eaten.protein)} / ${goals.protein}г`,
              color: "var(--c-accent)",
            },
            {
              label: "Жиры",
              value: `${Math.round(eaten.fat)} / ${goals.fat}г`,
              color: "var(--c-warn)",
            },
            {
              label: "Углеводы",
              value: `${Math.round(eaten.carbs)} / ${goals.carbs}г`,
              color: "var(--c-accent2)",
            },
          ].map((m) => (
            <div className="macro-pill" key={m.label}>
              <div className="macro-val" style={{ color: m.color }}>
                {m.value}
              </div>
              <div className="macro-lab">{m.label}</div>
            </div>
          ))}
        </div>
      </section>

      {error && (
        <div className="card" style={{ padding: 14, color: "var(--c-danger)", marginTop: 10 }}>
          {error}
        </div>
      )}

      <div className="section-title">Приёмы пищи</div>
      {!current.exists || meals.length === 0 ? (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 700 }}>На этот день плана нет</div>
          <div className="muted">Сгенерируй или обнови план через меню в правом верхнем углу блока дня.</div>
        </div>
      ) : (
        <div className="plan-meals-stack">
          {mealsSorted.map((meal, idx) => (
            <PlanMealCard key={`${meal.type}-${meal.time}-${idx}`} meal={meal} />
          ))}
        </div>
      )}

      <button type="button" className="pill-btn pill-btn-primary" style={{ marginTop: 12 }} onClick={() => setMenuOpen(true)}>
        Обновить план
      </button>

      <PlanMenuModal
        open={menuOpen}
        anchorDate={anchorDate}
        onClose={() => setMenuOpen(false)}
        onConfirm={handleMenuConfirm}
      />
    </div>
  );
}

function PlanMealCard({ meal }) {
  const type = ["breakfast", "lunch", "dinner", "snack"].includes(meal.type) ? meal.type : "snack";
  const label = MEAL_LABEL[type] || meal.type || "Приём";
  const kcal = Math.round(Number(meal.total_kcal) || 0);
  const p = Math.round(Number(meal.total_protein) || 0);
  const f = Math.round(Number(meal.total_fat) || 0);
  const c = Math.round(Number(meal.total_carbs) || 0);

  return (
    <article className={`plan-meal-card plan-meal-card--${type}`}>
      <div className="plan-meal-card__inner">
        <div className="plan-meal-card__top">
          <span className="plan-meal-card__type">{label}</span>
          {meal.time ? (
            <time className="plan-meal-card__time" dateTime={String(meal.time)}>
              {meal.time}
            </time>
          ) : null}
        </div>
        <h3 className="plan-meal-card__dish">{meal.dish_name || "Блюдо"}</h3>
        <div className="plan-meal-card__stats">
          <span className="plan-meal-card__kcal">{kcal} ккал</span>
          <span className="plan-meal-card__macros" aria-label="Белки, жиры, углеводы">
            Б {p}г · Ж {f}г · У {c}г
          </span>
        </div>
      </div>
    </article>
  );
}
