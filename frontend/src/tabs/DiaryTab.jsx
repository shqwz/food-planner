import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../api/client";

const GOAL = { kcal: 2200, protein: 140, fat: 70, carbs: 230 };

const MEAL_LABEL = {
  breakfast: "Завтрак",
  lunch: "Обед",
  dinner: "Ужин",
  snack: "Перекус",
};

const SOURCE_LABEL = {
  plan: "По плану",
  plan_over: "Чуть больше плана",
  other: "Вне плана",
};

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
    kcal: round1((meal.total_kcal || 0) * f),
    protein: round1((meal.total_protein || 0) * f),
    fat: round1((meal.total_fat || 0) * f),
    carbs: round1((meal.total_carbs || 0) * f),
    cost: round1((meal.estimated_cost || 0) * f),
  };
  return { ingredients, meal_totals };
}

function parseMealTime(m) {
  const raw = (m && m.time) || "12:00";
  const [h, mi] = String(raw).split(":").map((x) => parseInt(x, 10));
  const hh = Number.isFinite(h) ? h : 12;
  const mm = Number.isFinite(mi) ? mi : 0;
  return hh * 60 + mm;
}

function sortPlanMealsIndexed(meals) {
  return meals
    .map((m, idx) => ({ m, idx }))
    .sort((a, b) => parseMealTime(a.m) - parseMealTime(b.m));
}

/** Сопоставляет приёмы из плана с записями дневника по типу и порядку во времени. */
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
    const t = MEAL_LABEL[m.type] || m.type;
    const dish = m.dish_name || "блюдо";
    return { title: `${t} · ${dish}`, subtitle: null };
  }
  return diaryModalHeadline(step);
}

function diaryModalHeadline(step) {
  switch (step) {
    case "pick":
      return { title: "Ты сейчас отмечаешь приём в дневнике", subtitle: null };
    case "plan":
      return { title: "Загружаем твоё меню на этот день…", subtitle: null };
    case "plan_meal":
      return { title: "Укажи блюдо из расчётного меню", subtitle: null };
    case "plan_over_slider":
      return { title: "То же блюдо — на сколько больше меню?", subtitle: null };
    case "other_desc":
      return { title: "Опиши, что ел (вне меню на сегодня)", subtitle: null };
    case "other_preview":
      return { title: "Проверь оценку перед сохранением", subtitle: null };
    default:
      return { title: "", subtitle: null };
  }
}

export default function DiaryTab({ showToast, userId }) {
  const [diary, setDiary] = useState({
    date: "",
    meals: [],
    totals: { kcal: 0, protein: 0, fat: 0, carbs: 0 },
  });
  const [todayPlan, setTodayPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState("pick");
  const [entryMode, setEntryMode] = useState("");
  const [planData, setPlanData] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [mealFocusIndex, setMealFocusIndex] = useState(null);
  const [selectedMealIdx, setSelectedMealIdx] = useState(0);
  const [overPct, setOverPct] = useState(112);
  const [otherDescription, setOtherDescription] = useState("");
  const [analyzedMeal, setAnalyzedMeal] = useState(null);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const refreshDiary = useCallback(async () => {
    const data = await apiGet("/api/diary", { user_id: userId, date: todayStr });
    setDiary(data);
  }, [userId, todayStr]);

  const refreshTodayPlan = useCallback(async () => {
    const p = await apiGet("/api/plan", { user_id: userId, date: todayStr });
    setTodayPlan(p);
  }, [userId, todayStr]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        await Promise.all([refreshDiary(), refreshTodayPlan()]);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId, refreshDiary, refreshTodayPlan]);

  const eaten = useMemo(() => diary.totals || { kcal: 0, protein: 0, fat: 0, carbs: 0 }, [diary]);

  const dayGoals = useMemo(() => {
    const d = todayPlan?.daily_totals;
    if (d && todayPlan?.exists) {
      return {
        kcal: Math.max(1, Math.round(Number(d.kcal) || GOAL.kcal)),
        protein: Math.round(Number(d.protein) || GOAL.protein),
        fat: Math.round(Number(d.fat) || GOAL.fat),
        carbs: Math.round(Number(d.carbs) || GOAL.carbs),
      };
    }
    return { ...GOAL };
  }, [todayPlan]);

  const remaining = useMemo(
    () => ({
      kcal: dayGoals.kcal - eaten.kcal,
      protein: dayGoals.protein - eaten.protein,
      fat: dayGoals.fat - eaten.fat,
      carbs: dayGoals.carbs - eaten.carbs,
    }),
    [eaten, dayGoals],
  );

  const diaryDate = diary.date || todayStr;

  const resetModal = () => {
    setModalStep("pick");
    setEntryMode("");
    setPlanData(null);
    setMealFocusIndex(null);
    setSelectedMealIdx(0);
    setOverPct(112);
    setOtherDescription("");
    setAnalyzedMeal(null);
  };

  const openModal = () => {
    resetModal();
    setModalOpen(true);
  };

  const openModalForSlot = (planMealIndex) => {
    if (!todayPlan?.exists) {
      showToast("📋", "На сегодня нет расчётного меню — сначала сгенерируй план");
      return;
    }
    setModalStep("pick");
    setEntryMode("");
    setOverPct(112);
    setOtherDescription("");
    setAnalyzedMeal(null);
    setMealFocusIndex(planMealIndex);
    setSelectedMealIdx(planMealIndex);
    setPlanData(todayPlan);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    resetModal();
  };

  const startPlanFlow = async (mode) => {
    setEntryMode(mode);
    if (todayPlan?.exists && mealFocusIndex != null) {
      setPlanData(todayPlan);
      setSelectedMealIdx(mealFocusIndex);
      if (mode === "plan") {
        setPlanLoading(true);
        try {
          await submitFromPlan({
            plan: todayPlan,
            mealIdx: mealFocusIndex,
            pct: 100,
          });
        } finally {
          setPlanLoading(false);
        }
        return;
      }
      if (mode === "plan_over") {
        setModalStep("plan_over_slider");
        return;
      }
    }

    setPlanLoading(true);
    setPlanData(null);
    setModalStep("plan");
    try {
      const p = await apiGet("/api/plan", { user_id: userId, date: diaryDate });
      if (!p.exists) {
        showToast("📋", "На этот день нет плана — сначала сгенерируй его");
        setModalStep("pick");
        setEntryMode("");
        return;
      }
      setPlanData(p);
      setSelectedMealIdx(0);
      if (mode === "plan") {
        setModalStep("plan_meal");
      } else {
        setModalStep("plan_over_slider");
      }
    } catch (e) {
      showToast("⚠️", e.message);
      setModalStep("pick");
      setEntryMode("");
    } finally {
      setPlanLoading(false);
    }
  };

  const startOtherFlow = () => {
    setEntryMode("other");
    setModalStep("other_desc");
    setOtherDescription("");
    setAnalyzedMeal(null);
  };

  const runAnalyze = async () => {
    const text = otherDescription.trim();
    if (!text) {
      showToast("✏️", "Опиши, что съел");
      return;
    }
    setAnalyzeLoading(true);
    try {
      const res = await apiPost("/api/plan/analyze", { description: text });
      const ingredients = Array.isArray(res.ingredients) ? res.ingredients : [];
      const dish_name = res.dish_name || "Приём пищи";
      const totals =
        res.totals ||
        ingredients.reduce(
          (acc, i) => ({
            kcal: acc.kcal + (Number(i.kcal) || 0),
            protein: acc.protein + (Number(i.protein) || 0),
            fat: acc.fat + (Number(i.fat) || 0),
            carbs: acc.carbs + (Number(i.carbs) || 0),
          }),
          { kcal: 0, protein: 0, fat: 0, carbs: 0 },
        );
      setAnalyzedMeal({
        dish_name,
        ingredients: ingredients.map((i) => ({
          name: i.name,
          amount: Number(i.amount) || 0,
          unit: i.unit || "г",
          kcal: Number(i.kcal) || 0,
          protein: Number(i.protein) || 0,
          fat: Number(i.fat) || 0,
          carbs: Number(i.carbs) || 0,
          cost: Number(i.cost) || 0,
        })),
        totals,
      });
      setModalStep("other_preview");
    } catch (e) {
      showToast("⚠️", e.message);
    } finally {
      setAnalyzeLoading(false);
    }
  };

  const submitDiaryPost = async (payload) => {
    setSubmitting(true);
    try {
      await apiPost("/api/diary", { user_id: userId, ...payload });
      showToast("✅", "Приём записан");
      closeModal();
      await Promise.all([refreshDiary(), refreshTodayPlan()]);
    } catch (e) {
      showToast("⚠️", e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const submitFromPlan = async (opts) => {
    const src = opts?.plan ?? planData;
    const mealIdx = opts?.mealIdx ?? selectedMealIdx;
    const pct =
      opts?.pct != null
        ? opts.pct
        : entryMode === "plan_over"
          ? overPct
          : 100;
    if (!src?.meals?.length) return;
    const meal = src.meals[mealIdx];
    if (!meal) return;
    const { ingredients, meal_totals } = scalePlannedMeal(meal, pct);
    const isOver = pct > 100;
    const notes = isOver ? `Порции × ${pct}% к плану` : "";
    await submitDiaryPost({
      date: diaryDate,
      meal_type: meal.type || "snack",
      dish_name: meal.dish_name || MEAL_LABEL[meal.type] || "Блюдо",
      ingredients,
      meal_totals,
      was_planned: true,
      entry_source: isOver ? "plan_over" : "plan",
      notes,
    });
  };

  const submitOther = async () => {
    if (!analyzedMeal?.ingredients?.length) {
      showToast("⚠️", "Нечего сохранять");
      return;
    }
    await submitDiaryPost({
      date: diaryDate,
      meal_type: "snack",
      dish_name: analyzedMeal.dish_name,
      ingredients: analyzedMeal.ingredients,
      meal_totals: analyzedMeal.totals,
      was_planned: false,
      entry_source: "other",
      notes: otherDescription.trim() ? otherDescription.trim() : "Вне плана / готовая еда",
    });
  };

  const plannedMeals = planData?.meals || [];

  const sortedSlots = useMemo(
    () => (todayPlan?.exists && Array.isArray(todayPlan.meals) ? sortPlanMealsIndexed(todayPlan.meals) : []),
    [todayPlan],
  );

  const slotDiaryMatch = useMemo(
    () => matchSlotsToDiaryEntries(todayPlan?.meals, diary.meals),
    [todayPlan, diary.meals],
  );

  const { title: modalTitle, subtitle: modalSubtitle } = useMemo(
    () => resolveModalHeadline(modalStep, mealFocusIndex, todayPlan),
    [modalStep, mealFocusIndex, todayPlan],
  );

  if (loading) {
    return (
      <div className="content">
        <div className="card" style={{ padding: 16 }}>Загружаем дневник...</div>
      </div>
    );
  }

  return (
    <div className="content content--diary-compact">
      <div className="today-hero">
        <div className="hero-label">Итог дня</div>
        <div className="hero-title">
          {Math.round(eaten.kcal)} из {dayGoals.kcal} ккал
        </div>
        <div className="macro-row">
          <div className="macro-pill">
            <div className="macro-val" style={{ color: "var(--c-accent)" }}>
              {Math.round(eaten.protein)} / {dayGoals.protein}г
            </div>
            <div className="macro-lab">Белки</div>
          </div>
          <div className="macro-pill">
            <div className="macro-val" style={{ color: "var(--c-warn)" }}>
              {Math.round(eaten.fat)} / {dayGoals.fat}г
            </div>
            <div className="macro-lab">Жиры</div>
          </div>
          <div className="macro-pill">
            <div className="macro-val" style={{ color: "var(--c-accent2)" }}>
              {Math.round(eaten.carbs)} / {dayGoals.carbs}г
            </div>
            <div className="macro-lab">Углеводы</div>
          </div>
        </div>
        <div className="kpi">До цели: {Math.round(remaining.kcal)} ккал</div>
      </div>
      {error && (
        <div className="card" style={{ padding: 12, color: "var(--c-danger)" }}>{error}</div>
      )}

      {!loading && todayPlan?.exists && sortedSlots.length > 0 ? (
        <>
          <div className="section-title">Меню на сегодня</div>
          <p className="section-lead">Когда поел — жми «Отметить».</p>
          {sortedSlots.map(({ m, idx }) => {
            const logged = slotDiaryMatch[idx];
            return (
              <div
                className={`card planned-meal-slot ${logged ? "planned-meal-slot--logged" : ""}`}
                key={`${idx}-${m.type}-${m.dish_name || ""}`}
              >
                <div className="planned-meal-slot-top">
                  <span className="planned-meal-type">{MEAL_LABEL[m.type] || m.type}</span>
                  {m.time ? <span className="planned-meal-time">{m.time}</span> : null}
                </div>
                <div className="planned-meal-dish">{m.dish_name || "Блюдо"}</div>
                <div className="planned-meal-meta">
                  В меню ~{Math.round(m.total_kcal || 0)} ккал
                  {m.total_protein != null ? ` · Б ${Math.round(m.total_protein)}г` : ""}
                </div>
                {logged ? (
                  <div className="planned-meal-logged-block">
                    <div className="planned-meal-done-row">
                      <span className="planned-meal-done-badge">Учтено</span>
                      <span className="planned-meal-done-kcal">{Math.round(logged.totals?.kcal || 0)} ккал в дневнике</span>
                    </div>
                    {logged.entry_source ? (
                      <div className="planned-meal-done-source">
                        {SOURCE_LABEL[logged.entry_source] || logged.entry_source}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className="pill-btn pill-btn-ghost planned-meal-cta planned-meal-cta--secondary"
                      onClick={() => openModalForSlot(idx)}
                    >
                      Уточнить приём
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="pill-btn pill-btn-primary planned-meal-cta"
                    onClick={() => openModalForSlot(idx)}
                  >
                    Отметить приём
                  </button>
                )}
              </div>
            );
          })}
        </>
      ) : null}

      {!loading && (!todayPlan?.exists || sortedSlots.length === 0) ? (
        <div className="card plan-missing-hint plan-missing-hint--compact">
          <div className="plan-missing-title">Нет меню на сегодня</div>
          <div className="muted plan-missing-text">
            Сгенерируй план на вкладке «Сегодня».
          </div>
        </div>
      ) : null}

      <button type="button" className="pill-btn pill-btn-ghost diary-extra-btn" onClick={openModal}>
        Другой приём или перекус
      </button>

      <div className="diary-history-bar">
        <button
          type="button"
          className="pill-btn diary-history-toggle"
          onClick={() => setShowHistory((v) => !v)}
          aria-expanded={showHistory}
        >
          <span className="diary-history-toggle-label">История</span>
          <span className="diary-history-toggle-count">{diary.meals.length}</span>
          <span className="diary-history-toggle-chevron" aria-hidden>{showHistory ? "▴" : "▾"}</span>
        </button>
      </div>

      {showHistory ? (
        <div className="diary-history-panel">
          {diary.meals.length === 0 ? (
            <div className="card diary-history-empty">
              <div className="diary-history-empty-title">Пока нет записей</div>
              <div className="muted diary-history-empty-text">Отметь приём выше или добавь перекус.</div>
            </div>
          ) : (
            diary.meals.map((entry) => (
              <div className="card diary-history-card" key={entry.id}>
                <div className="list-item list-item--compact">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{MEAL_LABEL[entry.meal_type] || entry.meal_type}</div>
                    <div className="kpi">{entry.dish_name}</div>
                    {entry.entry_source ? (
                      <div className="kpi">{SOURCE_LABEL[entry.entry_source] || entry.entry_source}</div>
                    ) : null}
                  </div>
                  <div className="badge">{Math.round(entry.totals?.kcal || 0)} ккал</div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}

      {modalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={closeModal}>
          <div
            className="modal-dialog"
            role="dialog"
            aria-labelledby="diary-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div className="modal-head-text">
                <h2 id="diary-modal-title" className="modal-title">{modalTitle}</h2>
                {modalSubtitle ? <p className="modal-subtitle">{modalSubtitle}</p> : null}
              </div>
              <button type="button" className="modal-close" onClick={closeModal} aria-label="Закрыть">
                ×
              </button>
            </div>

            <div className="modal-body">
              {modalStep === "pick" && (
                <div className="modal-option-list" role="radiogroup" aria-labelledby="diary-modal-title">
                  {planLoading && mealFocusIndex != null ? (
                    <p className="modal-inline-loading">Сохраняем в дневник…</p>
                  ) : null}
                  <button
                    type="button"
                    className="modal-option-card modal-option-card--accent"
                    disabled={planLoading}
                    onClick={() => startPlanFlow("plan")}
                  >
                    <span className="modal-option-title">В меню один в один</span>
                    <span className="modal-option-desc">Ел так, как уже заложено в план на сегодня</span>
                  </button>
                  <button
                    type="button"
                    className="modal-option-card"
                    disabled={planLoading}
                    onClick={() => startPlanFlow("plan_over")}
                  >
                    <span className="modal-option-title">То же блюдо — больше порция</span>
                    <span className="modal-option-desc">Тот же состав, но добавил порцию или граммы</span>
                  </button>
                  <button type="button" className="modal-option-card" disabled={planLoading} onClick={startOtherFlow}>
                    <span className="modal-option-title">Не из меню на сегодня</span>
                    <span className="modal-option-desc">Готовое, заказ, покупное — просто расскажешь что было</span>
                  </button>
                </div>
              )}

              {modalStep === "plan" && planLoading && (
                <div className="modal-loading">Загружаем план на этот день…</div>
              )}

              {modalStep === "plan_meal" && plannedMeals.length > 0 && (
                <div className="modal-stack">
                  <div className="field-group">
                    <label className="field-label" htmlFor="diary-plan-meal">Блюдо</label>
                    <div className="modal-select-wrap">
                      <select
                        id="diary-plan-meal"
                        className="modal-select"
                        value={selectedMealIdx}
                        onChange={(e) => setSelectedMealIdx(Number(e.target.value))}
                      >
                        {plannedMeals.map((m, idx) => (
                          <option key={idx} value={idx}>
                            {MEAL_LABEL[m.type] || m.type} — {m.dish_name || "блюдо"} ({Math.round(m.total_kcal || 0)} ккал)
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="pill-btn pill-btn-primary modal-stack-submit"
                    disabled={submitting}
                    onClick={submitFromPlan}
                  >
                    {submitting ? "Сохраняем…" : "Записать в дневник"}
                  </button>
                </div>
              )}

              {modalStep === "plan_over_slider" && plannedMeals.length > 0 && (
                <div className="modal-stack">
                  <div className="field-group">
                    <label className="field-label" htmlFor="diary-plan-meal-over">Блюдо из меню</label>
                    <div className="modal-select-wrap">
                      <select
                        id="diary-plan-meal-over"
                        className="modal-select"
                        value={selectedMealIdx}
                        onChange={(e) => setSelectedMealIdx(Number(e.target.value))}
                      >
                        {plannedMeals.map((m, idx) => (
                          <option key={idx} value={idx}>
                            {MEAL_LABEL[m.type] || m.type} — {m.dish_name || "блюдо"}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="field-group">
                    <label className="field-label field-label--readable" htmlFor="diary-over-range">
                      На сколько больше меню умножаем порцию и калории · <strong className="modal-range-strong">{overPct}%</strong>
                    </label>
                    <input
                      id="diary-over-range"
                      type="range"
                      min={101}
                      max={150}
                      value={overPct}
                      onChange={(e) => setOverPct(Number(e.target.value))}
                      className="modal-range"
                    />
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
                  <button
                    type="button"
                    className="pill-btn pill-btn-primary modal-stack-submit"
                    disabled={submitting}
                    onClick={submitFromPlan}
                  >
                    {submitting ? "Сохраняем…" : "Записать в дневник"}
                  </button>
                </div>
              )}

              {modalStep === "other_desc" && (
                <div className="modal-stack">
                  <div className="field-group">
                    <label className="field-label" htmlFor="diary-other-desc">Описание</label>
                    <textarea
                      id="diary-other-desc"
                      className="modal-textarea"
                      rows={5}
                      value={otherDescription}
                      placeholder="Например: шаурма куриная большая без соуса, кола 0.5 или купил сырник и кофе"
                      onChange={(e) => setOtherDescription(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="pill-btn pill-btn-primary modal-stack-submit"
                    disabled={analyzeLoading}
                    onClick={runAnalyze}
                  >
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
                        <span className="muted">
                          {" "}{i.amount}{i.unit} · ~{Math.round(i.kcal)} ккал
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="preview-totals preview-totals--tight">
                    <span>≈ {Math.round(analyzedMeal.totals.kcal)} ккал</span>
                    <span>Б {Math.round(analyzedMeal.totals.protein)}г</span>
                    <span>Ж {Math.round(analyzedMeal.totals.fat)}г</span>
                    <span>У {Math.round(analyzedMeal.totals.carbs)}г</span>
                  </div>
                  <div className="preview-footnote">
                    Приблизительная оценка. Кладовая не изменится.
                  </div>
                  <button
                    type="button"
                    className="pill-btn pill-btn-primary modal-stack-submit"
                    disabled={submitting}
                    onClick={submitOther}
                  >
                    {submitting ? "Сохраняем…" : "Сохранить в дневник"}
                  </button>
                  <button
                    type="button"
                    className="pill-btn pill-btn-ghost modal-stack-secondary"
                    onClick={() => setModalStep("other_desc")}
                  >
                    Изменить описание
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
