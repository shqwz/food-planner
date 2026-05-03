import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPost } from "../api/client";
import PlanMenuModal from "./PlanMenuModal";
import { IconMoreHorizontal } from "../components/ui-icons";

const MEAL_LABEL = {
  breakfast: "Завтрак",
  lunch: "Обед",
  dinner: "Ужин",
  snack: "Перекус",
};

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

export default function PlanTab({ showToast, userId }) {
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [extendDismissed, setExtendDismissed] = useState(false);
  const scrollRef = useRef(null);
  const scrollRaf = useRef(0);

  const loadWindow = useCallback(async () => {
    setError("");
    const data = await apiGet("/api/plan/window", { user_id: userId, days: 14 });
    const list = data.days || [];
    setDays(list);
    const firstWith = list.findIndex((d) => d.exists);
    const idx = firstWith >= 0 ? firstWith : 0;
    setActiveIdx(idx);
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      const w = el.clientWidth || 1;
      el.scrollTo({ left: idx * w, behavior: "auto" });
    });
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

  const onScrollSnap = () => {
    const el = scrollRef.current;
    if (!el) return;
    const w = el.clientWidth || 1;
    const i = Math.round(el.scrollLeft / w);
    setActiveIdx(Math.max(0, Math.min(i, days.length - 1)));
  };

  const onScroll = () => {
    if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current);
    scrollRaf.current = requestAnimationFrame(onScrollSnap);
  };

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
  const nextMeal = mealsSorted[0];

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

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 16, textTransform: "capitalize" }}>
            {formatPlanHeader(anchorDate)}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {current.exists ? (current.day_type === "training" ? "Тренировка" : "Отдых") : "Нет записи"}
          </div>
        </div>
        <button type="button" className="icon-btn icon-btn--svg" aria-label="Меню плана" onClick={() => setMenuOpen(true)}>
          <IconMoreHorizontal size={20} />
        </button>
      </div>

      <div className="plan-dots" style={{ marginBottom: 10 }}>
        {days.map((d, i) => (
          <button
            key={d.plan_date}
            type="button"
            aria-label={d.plan_date}
            className={`plan-dot${i === activeIdx ? " plan-dot--active" : ""}${d.exists ? " plan-dot--has" : ""}`}
            onClick={() => {
              const el = scrollRef.current;
              if (!el) return;
              const w = el.clientWidth || 1;
              el.scrollTo({ left: i * w, behavior: "smooth" });
            }}
            style={{
              border: "none",
              padding: 0,
              cursor: "pointer",
              opacity: d.exists ? 1 : 0.35,
            }}
          />
        ))}
      </div>

      <div className="plan-carousel" style={{ overflow: "hidden", width: "100%" }}>
        <div ref={scrollRef} className="plan-days-scroll" onScroll={onScroll}>
          {days.map((d) => (
            <PlanDayPage key={d.plan_date} day={d} />
          ))}
        </div>
      </div>

      <section className="today-hero" style={{ marginTop: 8 }}>
        <div className="hero-label">Выбранный день</div>
        <div className="hero-title">{daily.kcal || 0} из 2100 ккал</div>
        <div className="hero-sub">
          {current.exists && nextMeal
            ? `Следующий приём: ${nextMeal.time || "--:--"}`
            : current.exists
              ? "Нет приёмов в записи"
              : "Нет плана на эту дату"}
        </div>
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${Math.min(100, Math.round(((daily.kcal || 0) / 2100) * 100))}%` }}
          />
        </div>
        <div className="macro-row">
          {[
            { label: "Белки", value: `${Math.round(daily.protein || 0)}г`, color: "var(--c-accent)" },
            { label: "Жиры", value: `${Math.round(daily.fat || 0)}г`, color: "var(--c-warn)" },
            { label: "Углеводы", value: `${Math.round(daily.carbs || 0)}г`, color: "var(--c-accent2)" },
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
        <>
          <p className="section-lead">Отметить приём по факту еды можно во вкладке «Дневник».</p>
          <div className="plan-meals-stack">
            {mealsSorted.map((meal, idx) => (
              <PlanMealCard key={`${meal.type}-${meal.time}-${idx}`} meal={meal} />
            ))}
          </div>
        </>
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

function PlanDayPage({ day }) {
  const daily = day.daily_totals || {};
  const meals = day.meals || [];
  if (!day.exists) {
    return (
      <div className="plan-day-page">
        <div className="card" style={{ padding: 20, margin: "0 4px" }}>
          <div style={{ fontWeight: 700 }}>Нет плана</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 14 }}>
            Свайпни к другому дню или обнови план.
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="plan-day-page">
      <div className="card" style={{ padding: 16, margin: "0 4px", minHeight: 160 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>
          {day.day_type === "training" ? "Тренировка" : "Отдых"}
        </div>
        <div className="kpi">Ккал · Б · Ж · У</div>
        <div style={{ fontWeight: 700, marginTop: 4 }}>
          {Math.round(daily.kcal || 0)} · {Math.round(daily.protein || 0)} · {Math.round(daily.fat || 0)} ·{" "}
          {Math.round(daily.carbs || 0)}
        </div>
        <div className="muted" style={{ marginTop: 12, fontSize: 13 }}>
          {meals.length} приёма — детали ниже
        </div>
      </div>
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
