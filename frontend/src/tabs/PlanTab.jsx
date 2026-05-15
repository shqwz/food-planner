import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../api/client";
import PlanMenuModal from "./PlanMenuModal";

// ─── константы ────────────────────────────────────────────────────────────────

const GOAL = { kcal: 2200, protein: 140, fat: 70, carbs: 230 };

const MEAL_LABEL = {
  breakfast: "Завтрак",
  lunch: "Обед",
  dinner: "Ужин",
  snack: "Перекус",
};

const MEAL_ACCENT = {
  breakfast: "var(--meal-breakfast)",
  lunch:     "var(--meal-lunch)",
  dinner:    "var(--meal-dinner)",
  snack:     "var(--meal-snack)",
};

const SOURCE_LABEL = {
  plan:      "По плану",
  plan_over: "Чуть больше плана",
  other:     "Вне плана",
};

// ─── утилиты ──────────────────────────────────────────────────────────────────

function mskTodayIso() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Moscow",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function parseMealTime(m) {
  const raw = (m && m.time) || "12:00";
  const [h, mi] = String(raw).split(":").map((x) => parseInt(x, 10));
  return (Number.isFinite(h) ? h : 12) * 60 + (Number.isFinite(mi) ? mi : 0);
}

function sortMealsByTime(meals) {
  return [...(meals || [])].sort((a, b) => parseMealTime(a) - parseMealTime(b));
}

function sortPlanMealsIndexed(meals) {
  return (meals || [])
    .map((m, idx) => ({ m, idx }))
    .sort((a, b) => parseMealTime(a.m) - parseMealTime(b.m));
}

function daysBetweenInclusive(isoFrom, isoTo) {
  const a = new Date(`${isoFrom}T12:00:00`);
  const b = new Date(`${isoTo}T12:00:00`);
  return Math.round((b - a) / 86400000);
}

function capFirst(str) {
  if (!str) return "";
  return str.replace(/^./, (c) => c.toUpperCase());
}

function planWeekdayLabel(iso) {
  if (!iso) return "";
  return capFirst(new Date(`${iso}T12:00:00`).toLocaleDateString("ru-RU", { weekday: "long" }));
}

function planDayNumber(iso) {
  if (!iso) return "";
  return new Date(`${iso}T12:00:00`).getDate();
}

function round1(n) {
  return Math.round(Number(n) * 10) / 10;
}

function scalePlannedMeal(meal, pct) {
  const f = pct / 100;
  const ingredients = (meal.ingredients || []).map((i) => ({
    name: i.name,
    amount: typeof i.amount === "number" ? round1(i.amount * f) : i.amount,
    unit: i.unit || "г",
  }));
  const meal_totals = {
    kcal:    round1((meal.total_kcal    || 0) * f),
    protein: round1((meal.total_protein || 0) * f),
    fat:     round1((meal.total_fat     || 0) * f),
    carbs:   round1((meal.total_carbs   || 0) * f),
    cost:    round1((meal.estimated_cost|| 0) * f),
  };
  return { ingredients, meal_totals };
}

function matchSlotsToDiaryEntries(planMeals, diaryMeals) {
  const slots = sortPlanMealsIndexed(planMeals || []);
  const diarySorted = [...(diaryMeals || [])].sort((a, b) =>
    String(a.consumed_at || "").localeCompare(String(b.consumed_at || "")),
  );
  const usedDiaryIdx = new Set();
  const byPlanIndex = {};
  for (const { m, idx } of slots) {
    const want = m.type || "snack";
    for (let i = 0; i < diarySorted.length; i++) {
      if (usedDiaryIdx.has(i)) continue;
      const d = diarySorted[i];
      if ((d.meal_type || "snack") === want) {
        usedDiaryIdx.add(i);
        byPlanIndex[idx] = d;
        break;
      }
    }
  }
  return byPlanIndex;
}

function resolveModalHeadline(step, mealFocusIndex, plan) {
  if (step === "pick" && mealFocusIndex != null && plan?.meals?.[mealFocusIndex]) {
    const m = plan.meals[mealFocusIndex];
    return { title: `${MEAL_LABEL[m.type] || m.type} · ${m.dish_name || "блюдо"}`, subtitle: null };
  }
  switch (step) {
    case "pick":           return { title: "Отметить приём", subtitle: null };
    case "plan":           return { title: "Загружаем меню…", subtitle: null };
    case "plan_meal":      return { title: "Блюдо из меню", subtitle: null };
    case "plan_over_slider": return { title: "Та же еда — больше порция", subtitle: null };
    case "other_desc":     return { title: "Опиши что ел", subtitle: null };
    case "other_preview":  return { title: "Проверь оценку", subtitle: null };
    default:               return { title: "", subtitle: null };
  }
}

// ─── компонент ────────────────────────────────────────────────────────────────

export default function PlanTab({
  showToast,
  userId,
  planExtendNoticeDismissed = false,
  onPlanExtendNoticeDismiss,
}) {
  // план / навигация
  const [days, setDays]                   = useState([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState("");
  const [activeIdx, setActiveIdx]         = useState(0);
  const [menuOpen, setMenuOpen]           = useState(false);
  const [generateBusy, setGenerateBusy]   = useState(false);
  const [streakDays, setStreakDays]       = useState(0);

  // дневник (только сегодняшний день)
  const todayIso = useMemo(() => mskTodayIso(), []);
  const [diary, setDiary]                 = useState({ date: "", meals: [], totals: { kcal: 0, protein: 0, fat: 0, carbs: 0 } });
  const [diaryLoading, setDiaryLoading]   = useState(false);

  // модал отметки
  const [modalOpen, setModalOpen]         = useState(false);
  const [modalStep, setModalStep]         = useState("pick");
  const [entryMode, setEntryMode]         = useState("");
  const [planData, setPlanData]           = useState(null);
  const [planLoading, setPlanLoading]     = useState(false);
  const [mealFocusIndex, setMealFocusIndex] = useState(null);
  const [selectedMealIdx, setSelectedMealIdx] = useState(0);
  const [overPct, setOverPct]             = useState(112);
  const [otherDescription, setOtherDescription] = useState("");
  const [analyzedMeal, setAnalyzedMeal]   = useState(null);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [submitting, setSubmitting]       = useState(false);

  // ── загрузка плана ──────────────────────────────────────────────────────────

  const loadWindow = useCallback(async () => {
    setError("");
    const data = await apiGet("/api/plan/window", { user_id: userId, days: 14 });
    const list = data.days || [];
    setDays(list);
    const firstWith = list.findIndex((d) => d.exists);
    setActiveIdx(firstWith >= 0 ? firstWith : 0);
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
      loadWindow()
        .catch((e) => { if (!cancelled) setError(e.message); })
        .finally(() => { if (!cancelled) setLoading(false); });
    });
    return () => { cancelled = true; };
  }, [loadWindow]);

  // ── стрик ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    apiGet("/api/diary/streak", { user_id: userId })
      .then((p) => { if (!cancelled) setStreakDays(Math.max(0, Number(p?.streak_days) || 0)); })
      .catch(() => { if (!cancelled) setStreakDays(0); });
    return () => { cancelled = true; };
  }, [userId]);

  // ── дневник (только сегодня) ─────────────────────────────────────────────────

  const refreshDiary = useCallback(async () => {
    setDiaryLoading(true);
    try {
      const data = await apiGet("/api/diary", { user_id: userId, date: todayIso });
      setDiary(data);
    } catch { /* тихо */ } finally {
      setDiaryLoading(false);
    }
  }, [userId, todayIso]);

  useEffect(() => {
    if (userId) refreshDiary();
  }, [userId, refreshDiary]);

  // ── вычисляемые ─────────────────────────────────────────────────────────────

  const current    = days[activeIdx] || {};
  const anchorDate = current.plan_date || todayIso;
  const isToday    = anchorDate === todayIso;

  const existingDates = days.filter((d) => d.exists).map((d) => d.plan_date);
  const lastPlan      = existingDates.length ? existingDates.sort().slice(-1)[0] : null;
  const daysLeft      = lastPlan != null ? Math.max(0, daysBetweenInclusive(todayIso, lastPlan)) : null;
  const showExtend =
    !planExtendNoticeDismissed && daysLeft != null && daysLeft <= 2 && lastPlan != null;

  const eaten    = diary.totals || { kcal: 0, protein: 0, fat: 0, carbs: 0 };
  const dayGoals = useMemo(() => {
    const d = current.daily_totals;
    if (d && current.exists) {
      return {
        kcal:    Math.max(1, Math.round(Number(d.kcal)    || GOAL.kcal)),
        protein: Math.round(Number(d.protein) || GOAL.protein),
        fat:     Math.round(Number(d.fat)     || GOAL.fat),
        carbs:   Math.round(Number(d.carbs)   || GOAL.carbs),
      };
    }
    return { ...GOAL };
  }, [current]);

  const sortedSlots = useMemo(
    () => (current.exists && Array.isArray(current.meals) ? sortPlanMealsIndexed(current.meals) : []),
    [current],
  );

  const slotDiaryMatch = useMemo(
    () => isToday ? matchSlotsToDiaryEntries(current.meals, diary.meals) : {},
    [isToday, current.meals, diary.meals],
  );

  // ── генерация плана ──────────────────────────────────────────────────────────

  const runGenerate = async (payload) => {
    setGenerateBusy(true);
    try {
      await apiPost("/api/plan/generate", {
        user_id: userId,
        planner: { meals_count: "auto", sleep_quality: "normal", overeating_event: null },
        ...payload,
      });
      await loadWindow();
    } finally {
      setGenerateBusy(false);
    }
  };

  const handleMenuConfirm = async ({ period, start_from }) => {
    try {
      await runGenerate({ period, ...(start_from ? { start_from } : {}) });
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  const extendPlan = async () => {
    try {
      await runGenerate({ period: "week" });
      onPlanExtendNoticeDismiss?.();
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  // ── модал отметки ────────────────────────────────────────────────────────────

  const resetModal = () => {
    setModalStep("pick"); setEntryMode(""); setPlanData(null);
    setMealFocusIndex(null); setSelectedMealIdx(0);
    setOverPct(112); setOtherDescription(""); setAnalyzedMeal(null);
  };

  const closeModal = () => { setModalOpen(false); resetModal(); };

  const openModalForSlot = (planMealIndex) => {
    if (!current.exists) {
      showToast("На этот день нет плана", "info");
      return;
    }
    resetModal();
    setMealFocusIndex(planMealIndex);
    setSelectedMealIdx(planMealIndex);
    setPlanData(current);
    setModalOpen(true);
  };

  const openFreeModal = () => { resetModal(); setModalOpen(true); };

  const startPlanFlow = async (mode) => {
    setEntryMode(mode);
    if (current.exists && mealFocusIndex != null) {
      setPlanData(current);
      setSelectedMealIdx(mealFocusIndex);
      if (mode === "plan") {
        setPlanLoading(true);
        try {
          await submitFromPlan({ plan: current, mealIdx: mealFocusIndex, pct: 100 });
        } finally { setPlanLoading(false); }
        return;
      }
      if (mode === "plan_over") { setModalStep("plan_over_slider"); return; }
    }
    setPlanLoading(true);
    setPlanData(null);
    setModalStep("plan");
    try {
      const p = await apiGet("/api/plan", { user_id: userId, date: anchorDate });
      if (!p.exists) {
        showToast("На этот день нет плана — сначала сгенерируй его", "info");
        setModalStep("pick"); setEntryMode(""); return;
      }
      setPlanData(p);
      setSelectedMealIdx(0);
      setModalStep(mode === "plan" ? "plan_meal" : "plan_over_slider");
    } catch (e) {
      showToast(e.message, "error");
      setModalStep("pick"); setEntryMode("");
    } finally { setPlanLoading(false); }
  };

  const startOtherFlow = () => {
    setEntryMode("other"); setModalStep("other_desc"); setOtherDescription(""); setAnalyzedMeal(null);
  };

  const runAnalyze = async () => {
    const text = otherDescription.trim();
    if (!text) { showToast("Опиши, что съел", "info"); return; }
    setAnalyzeLoading(true);
    try {
      const res = await apiPost("/api/plan/analyze", { description: text });
      const ingredients = Array.isArray(res.ingredients) ? res.ingredients : [];
      const totals = res.totals || ingredients.reduce(
        (acc, i) => ({ kcal: acc.kcal + (Number(i.kcal) || 0), protein: acc.protein + (Number(i.protein) || 0), fat: acc.fat + (Number(i.fat) || 0), carbs: acc.carbs + (Number(i.carbs) || 0) }),
        { kcal: 0, protein: 0, fat: 0, carbs: 0 },
      );
      setAnalyzedMeal({ dish_name: res.dish_name || "Приём пищи", ingredients: ingredients.map((i) => ({ name: i.name, amount: Number(i.amount) || 0, unit: i.unit || "г", kcal: Number(i.kcal) || 0, protein: Number(i.protein) || 0, fat: Number(i.fat) || 0, carbs: Number(i.carbs) || 0, cost: Number(i.cost) || 0 })), totals });
      setModalStep("other_preview");
    } catch (e) { showToast(e.message, "error"); } finally { setAnalyzeLoading(false); }
  };

  const submitDiaryPost = async (payload) => {
    setSubmitting(true);
    try {
      await apiPost("/api/diary", { user_id: userId, ...payload });
      showToast("Приём записан", "success");
      closeModal();
      await refreshDiary();
    } catch (e) { showToast(e.message, "error"); } finally { setSubmitting(false); }
  };

  const submitFromPlan = async (opts) => {
    const src      = opts?.plan ?? planData;
    const mealIdx  = opts?.mealIdx ?? selectedMealIdx;
    const pct      = opts?.pct != null ? opts.pct : entryMode === "plan_over" ? overPct : 100;
    if (!src?.meals?.length) return;
    const meal = src.meals[mealIdx];
    if (!meal) return;
    const { ingredients, meal_totals } = scalePlannedMeal(meal, pct);
    await submitDiaryPost({
      date: anchorDate,
      meal_type: meal.type || "snack",
      dish_name: meal.dish_name || MEAL_LABEL[meal.type] || "Блюдо",
      ingredients, meal_totals,
      was_planned: true,
      entry_source: pct > 100 ? "plan_over" : "plan",
      notes: pct > 100 ? `Порции × ${pct}% к плану` : "",
    });
  };

  const submitOther = async () => {
    if (!analyzedMeal?.ingredients?.length) { showToast("Нечего сохранять", "error"); return; }
    await submitDiaryPost({
      date: anchorDate,
      meal_type: "snack",
      dish_name: analyzedMeal.dish_name,
      ingredients: analyzedMeal.ingredients,
      meal_totals: analyzedMeal.totals,
      was_planned: false,
      entry_source: "other",
      notes: otherDescription.trim() || "Вне плана / готовая еда",
    });
  };

  const plannedMeals = planData?.meals || [];
  const { title: modalTitle, subtitle: modalSubtitle } = useMemo(
    () => resolveModalHeadline(modalStep, mealFocusIndex, current),
    [modalStep, mealFocusIndex, current],
  );

  // ── рендер ───────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="content"><div className="card" style={{ padding: 16 }}>Загружаем план…</div></div>;
  }

  return (
    <div className="content">

      {/* Предупреждение об окончании плана */}
      {showExtend && (
        <div className="plan-extend-notice">
          <div className="plan-extend-notice__title">
            {daysLeft === 0
              ? "План заканчивается сегодня"
              : `План заканчивается через ${daysLeft} ${daysLeft === 1 ? "день" : "дня"}`}
          </div>
          <p className="plan-extend-notice__text">Продлить на неделю вперёд?</p>
          <div className="plan-extend-notice__actions">
            <button type="button" className="pill-btn pill-btn-primary" onClick={extendPlan} disabled={generateBusy}>Да</button>
            <button type="button" className="pill-btn pill-btn-ghost" onClick={() => onPlanExtendNoticeDismiss?.()} disabled={generateBusy}>Позже</button>
          </div>
        </div>
      )}

      {/* Шапка дня — день недели, тип дня, стрик */}
      <section className="plan-day-picker" aria-labelledby="plan-day-picker-heading">
        <div className="plan-day-picker__head">
          <div className="plan-day-picker__intro">
            <p className="plan-day-picker__weekday" id="plan-day-picker-heading">
              {planWeekdayLabel(anchorDate)}
            </p>
            <span className={`plan-day-picker__pill${!current.exists ? " plan-day-picker__pill--empty" : current.day_type === "training" ? " plan-day-picker__pill--training" : " plan-day-picker__pill--rest"}`}>
              {!current.exists ? "Нет плана" : current.day_type === "training" ? "Тренировка" : "Отдых"}
            </span>
          </div>
          <div
            className={`plan-day-picker__streak${streakDays > 0 ? " plan-day-picker__streak--active" : " plan-day-picker__streak--inactive"}`}
            title={streakDays > 0 ? `Стрик: ${streakDays} дн.` : "Стрик: 0"}
          >
            <span className="plan-day-picker__streak-fire" aria-hidden />
            <span className="plan-day-picker__streak-days">{streakDays}</span>
          </div>
        </div>

        {/* Рейл дней */}
        <div className="plan-day-rail" role="tablist" aria-label="Дни в окне плана">
          {days.map((d, i) => (
            <button
              key={d.plan_date}
              type="button"
              role="tab"
              aria-selected={i === activeIdx}
              className={`plan-day-node${i === activeIdx ? " plan-day-node--active" : ""}${d.exists ? " plan-day-node--has" : " plan-day-node--empty"}`}
              onClick={() => setActiveIdx(i)}
            >
              <span className="plan-day-node__num" aria-hidden>{planDayNumber(d.plan_date)}</span>
              <span className="plan-day-node__dot" aria-hidden />
            </button>
          ))}
        </div>

        {/* Статистика КБЖУ — только для сегодня */}
        {isToday && current.exists && !diaryLoading && (
          <div className="plan-day-kbzhu">
            <div className="plan-day-kbzhu__kcal">
              <span className="plan-day-kbzhu__eaten">{Math.round(eaten.kcal)}</span>
              <span className="plan-day-kbzhu__sep"> / </span>
              <span className="plan-day-kbzhu__goal">{dayGoals.kcal} ккал</span>
            </div>
            <div className="plan-day-kbzhu__macros">
              <span className="plan-day-kbzhu__macro plan-day-kbzhu__macro--p">Б {Math.round(eaten.protein)}/{dayGoals.protein}</span>
              <span className="plan-day-kbzhu__macro plan-day-kbzhu__macro--f">Ж {Math.round(eaten.fat)}/{dayGoals.fat}</span>
              <span className="plan-day-kbzhu__macro plan-day-kbzhu__macro--c">У {Math.round(eaten.carbs)}/{dayGoals.carbs}</span>
            </div>
          </div>
        )}
      </section>

      {error && <div className="card" style={{ padding: 14, color: "var(--c-danger)", marginTop: 10 }}>{error}</div>}

      {/* Карточки приёмов */}
      {!current.exists || sortedSlots.length === 0 ? (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 700 }}>На этот день плана нет</div>
          <div className="muted">Сгенерируй или обнови план через кнопку ниже.</div>
        </div>
      ) : (
        <div className="plan-meals-stack">
          {sortedSlots.map(({ m, idx }) => {
            const type   = (m.type || "snack").toLowerCase();
            const logged = isToday ? slotDiaryMatch[idx] : null;
            return (
              <article
                key={`${idx}-${type}-${m.dish_name || ""}`}
                className={`plan-meal-card plan-meal-card--${type}${logged ? " plan-meal-card--logged" : ""}`}
              >
                <div className="plan-meal-card__inner">
                  <div className="plan-meal-card__body">
                    <div className="plan-meal-card__top">
                      <span className="plan-meal-card__type">{MEAL_LABEL[type] || m.type}</span>
                    </div>
                    <h3 className="plan-meal-card__dish">{m.dish_name || "Блюдо"}</h3>
                    {Array.isArray(m.ingredients) && m.ingredients.length > 0 && (
                      <ul className="plan-meal-card__ingredients">
                        {m.ingredients.map((ing, ii) => {
                          const name = String(ing.name || "").trim();
                          if (!name) return null;
                          const amt = Number(ing.amount);
                          const unit = String(ing.unit || "").trim();
                          const label = Number.isFinite(amt) && amt > 0
                            ? `${name} — ${Math.abs(amt - Math.round(amt)) < 0.01 ? Math.round(amt) : amt.toFixed(1)}${unit ? ` ${unit}` : ""}`
                            : name;
                          return <li key={ii} className="plan-meal-card__ingredient-item">{label}</li>;
                        })}
                      </ul>
                    )}
                    <div className="plan-meal-card__meta">
                      ~{Math.round(m.total_kcal || 0)} ккал
                      {m.total_protein != null ? ` · Б ${Math.round(m.total_protein)}г` : ""}
                    </div>
                    {isToday && logged?.entry_source && (
                      <div className="plan-meal-card__source">
                        {SOURCE_LABEL[logged.entry_source] || logged.entry_source}
                      </div>
                    )}
                  </div>
                  {isToday && (
                    <button
                      type="button"
                      className={`meal-check-box${logged ? " meal-check-box--done" : ""}`}
                      style={{ "--meal-accent": MEAL_ACCENT[type] || "var(--c-accent)" }}
                      onClick={() => openModalForSlot(idx)}
                      aria-label={logged ? "Уточнить приём" : "Отметить приём"}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2 7L5.5 10.5L12 3.5" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Кнопка «Другой приём» — только для сегодня */}
      {isToday && current.exists && (
        <button type="button" className="pill-btn pill-btn-ghost" style={{ marginTop: 4 }} onClick={openFreeModal}>
          Другой приём или перекус
        </button>
      )}

      <button
        type="button"
        className="pill-btn pill-btn-primary"
        style={{ marginTop: 8 }}
        disabled={generateBusy}
        onClick={() => setMenuOpen(true)}
      >
        {generateBusy ? "Генерируем…" : "Обновить план"}
      </button>

      <PlanMenuModal
        open={menuOpen || generateBusy}
        anchorDate={anchorDate}
        todayIso={todayIso}
        busy={generateBusy}
        onClose={() => setMenuOpen(false)}
        onConfirm={handleMenuConfirm}
      />

      {/* Модал отметки приёма */}
      {modalOpen && (
        <div className="modal-backdrop" role="presentation" onClick={closeModal}>
          <div className="modal-dialog" role="dialog" aria-labelledby="diary-modal-title" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-head-text">
                <h2 id="diary-modal-title" className="modal-title">{modalTitle}</h2>
                {modalSubtitle && <p className="modal-subtitle">{modalSubtitle}</p>}
              </div>
              <button type="button" className="modal-close" onClick={closeModal} aria-label="Закрыть">×</button>
            </div>
            <div className="modal-body">

              {modalStep === "pick" && (
                <div className="modal-option-list">
                  {planLoading && mealFocusIndex != null && <p className="modal-inline-loading">Сохраняем в дневник…</p>}
                  <button type="button" className="modal-option-card modal-option-card--accent" disabled={planLoading} onClick={() => startPlanFlow("plan")}>
                    <span className="modal-option-title">В меню один в один</span>
                    <span className="modal-option-desc">Ел так, как заложено в план</span>
                  </button>
                  <button type="button" className="modal-option-card" disabled={planLoading} onClick={() => startPlanFlow("plan_over")}>
                    <span className="modal-option-title">То же блюдо — больше порция</span>
                    <span className="modal-option-desc">Тот же состав, но добавил</span>
                  </button>
                  <button type="button" className="modal-option-card" disabled={planLoading} onClick={startOtherFlow}>
                    <span className="modal-option-title">Не из меню</span>
                    <span className="modal-option-desc">Готовое, заказ, покупное — расскажешь что было</span>
                  </button>
                </div>
              )}

              {modalStep === "plan" && planLoading && <div className="modal-loading">Загружаем план…</div>}

              {modalStep === "plan_meal" && plannedMeals.length > 0 && (
                <div className="modal-stack">
                  <div className="field-group">
                    <label className="field-label" htmlFor="diary-plan-meal">Блюдо</label>
                    <div className="modal-select-wrap">
                      <select id="diary-plan-meal" className="modal-select" value={selectedMealIdx} onChange={(e) => setSelectedMealIdx(Number(e.target.value))}>
                        {plannedMeals.map((m, i) => (
                          <option key={i} value={i}>{MEAL_LABEL[m.type] || m.type} — {m.dish_name || "блюдо"} ({Math.round(m.total_kcal || 0)} ккал)</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <button type="button" className="pill-btn pill-btn-primary modal-stack-submit" disabled={submitting} onClick={submitFromPlan}>
                    {submitting ? "Сохраняем…" : "Записать"}
                  </button>
                </div>
              )}

              {modalStep === "plan_over_slider" && plannedMeals.length > 0 && (
                <div className="modal-stack">
                  <div className="field-group">
                    <label className="field-label" htmlFor="diary-plan-meal-over">Блюдо из меню</label>
                    <div className="modal-select-wrap">
                      <select id="diary-plan-meal-over" className="modal-select" value={selectedMealIdx} onChange={(e) => setSelectedMealIdx(Number(e.target.value))}>
                        {plannedMeals.map((m, i) => (
                          <option key={i} value={i}>{MEAL_LABEL[m.type] || m.type} — {m.dish_name || "блюдо"}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="field-group">
                    <label className="field-label" htmlFor="diary-over-range">
                      Множитель порции · <strong className="modal-range-strong">{overPct}%</strong>
                    </label>
                    <input id="diary-over-range" type="range" min={101} max={150} value={overPct} onChange={(e) => setOverPct(Number(e.target.value))} className="modal-range" />
                  </div>
                  {(() => {
                    const m = plannedMeals[selectedMealIdx];
                    const { meal_totals } = scalePlannedMeal(m, overPct);
                    return (
                      <div className="preview-totals" aria-live="polite">
                        <span>≈ {Math.round(meal_totals.kcal)} ккал</span>
                        <span>Б {Math.round(meal_totals.protein)}г</span>
                        <span>Ж {Math.round(meal_totals.fat)}г</span>
                        <span>У {Math.round(meal_totals.carbs)}г</span>
                      </div>
                    );
                  })()}
                  <button type="button" className="pill-btn pill-btn-primary modal-stack-submit" disabled={submitting} onClick={submitFromPlan}>
                    {submitting ? "Сохраняем…" : "Записать"}
                  </button>
                </div>
              )}

              {modalStep === "other_desc" && (
                <div className="modal-stack">
                  <div className="field-group">
                    <label className="field-label" htmlFor="diary-other-desc">Описание</label>
                    <textarea id="diary-other-desc" className="modal-textarea" rows={5} value={otherDescription} placeholder="Например: шаурма куриная большая, кола 0.5 или купил сырник и кофе" onChange={(e) => setOtherDescription(e.target.value)} />
                  </div>
                  <button type="button" className="pill-btn pill-btn-primary modal-stack-submit" disabled={analyzeLoading} onClick={runAnalyze}>
                    {analyzeLoading ? "Разбираем…" : "Оценить КБЖУ"}
                  </button>
                </div>
              )}

              {modalStep === "other_preview" && analyzedMeal && (
                <div className="modal-stack">
                  <div className="preview-dish-title">{analyzedMeal.dish_name}</div>
                  <ul className="analyze-list">
                    {analyzedMeal.ingredients.map((i, ix) => (
                      <li key={ix}>
                        <span>{i.name}</span>
                        <span className="muted"> {i.amount}{i.unit} · ~{Math.round(i.kcal)} ккал</span>
                      </li>
                    ))}
                  </ul>
                  <div className="preview-totals preview-totals--tight">
                    <span>≈ {Math.round(analyzedMeal.totals.kcal)} ккал</span>
                    <span>Б {Math.round(analyzedMeal.totals.protein)}г</span>
                    <span>Ж {Math.round(analyzedMeal.totals.fat)}г</span>
                    <span>У {Math.round(analyzedMeal.totals.carbs)}г</span>
                  </div>
                  <div className="preview-footnote">Приблизительная оценка. Кладовая не изменится.</div>
                  <button type="button" className="pill-btn pill-btn-primary modal-stack-submit" disabled={submitting} onClick={submitOther}>
                    {submitting ? "Сохраняем…" : "Сохранить"}
                  </button>
                  <button type="button" className="pill-btn pill-btn-ghost modal-stack-secondary" onClick={() => setModalStep("other_desc")}>
                    Изменить описание
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
}