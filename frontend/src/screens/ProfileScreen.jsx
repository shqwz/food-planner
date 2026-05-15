import { useEffect, useRef, useState } from "react";
import { apiGet, apiPut } from "../api/client";
import DrumPicker from "../components/DrumPicker";

// ─────────────────────────────────────────────────────────────────────────────
// Константы
// ─────────────────────────────────────────────────────────────────────────────

const GOAL_LABEL = {
  recomposition: "Рекомпозиция",
  mass_gain:     "Набор массы",
  cutting:       "Сушка",
  custom:        "Своя цель",
};

const BUDGET_LABEL = {
  economy:   "Эконом (до 1500 ₽/нед)",
  medium:    "Средний (1500–3000 ₽/нед)",
  unlimited: "Без лимита",
  custom:    "Своя сумма",
};

const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const MONTHS = [
  "Январь","Февраль","Март","Апрель","Май","Июнь",
  "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь",
];


/** Активное состояние чипов профиля — только токены темы (--c-*), т.к. --color-* не заданы в CSS */
const CHIP_ACTIVE = {
  info: {
    borderColor: "var(--c-accent)",
    background: "var(--c-accent-light)",
    color: "var(--c-accent)",
  },
  success: {
    borderColor: "var(--c-accent)",
    background: "var(--c-accent-light)",
    color: "var(--c-accent)",
  },
  warning: {
    borderColor: "var(--c-warn)",
    background: "color-mix(in srgb, var(--c-warn) 16%, var(--c-surface2))",
    color: "var(--c-warn)",
  },
  danger: {
    borderColor: "var(--c-danger)",
    background: "color-mix(in srgb, var(--c-danger) 14%, var(--c-surface2))",
    color: "var(--c-danger)",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Вспомогательные функции
// ─────────────────────────────────────────────────────────────────────────────

function calcSleepHours(wakeTime, sleepTime) {
  try {
    const [wh, wm] = wakeTime.split(":").map(Number);
    const [sh, sm] = sleepTime.split(":").map(Number);
    const wMin = wh * 60 + wm;
    const sMin = sh * 60 + sm;
    const diff = sMin > wMin
      ? 24 * 60 - sMin + wMin
      : wMin - sMin;
    return (diff / 60).toFixed(1);
  } catch {
    return null;
  }
}

function pad2(n) { return String(n).padStart(2, "0"); }

/** Сегодня по локальному календарю устройства — для max у type="date" */
function todayIsoLocal() {
  const t = new Date();
  return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
}

/** Возраст в полных годах на сегодня по дате рождения YYYY-MM-DD (для сохранения в API). */
function ageFromBirthIso(iso) {
  const s = (iso || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const bd = new Date(y, m - 1, d);
  if (bd.getFullYear() !== y || bd.getMonth() !== m - 1 || bd.getDate() !== d) return null;
  const today = new Date();
  let age = today.getFullYear() - y;
  if (today.getMonth() < m - 1 || (today.getMonth() === m - 1 && today.getDate() < d)) age -= 1;
  return Math.max(0, age);
}

function Section({ label, children, editMode, onTap, dimmed, style }) {
  return (
    <div
      onClick={editMode ? onTap : undefined}
      style={{
        background: "var(--c-surface)",
        border: "0.5px solid var(--c-border-mid)",
        borderRadius: "var(--r-lg)",
        padding: "14px 16px",
        marginBottom: 10,
        position: "relative",
        cursor: editMode ? "pointer" : "default",
        opacity: dimmed ? 0.45 : 1,
        pointerEvents: dimmed ? "none" : undefined,
        transition: "opacity 0.2s",
        animation: editMode && !dimmed ? undefined : undefined,
        ...style,
      }}
    >
      {label && (
        <div style={{
          fontSize: 11, fontWeight: 500, textTransform: "uppercase",
          letterSpacing: "0.06em", color: "var(--c-text-secondary)",
          marginBottom: 8,
        }}>
          {label}
        </div>
      )}
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Основной компонент
// ─────────────────────────────────────────────────────────────────────────────

export default function ProfileScreen({ profile, onClose, userId, onProfileUpdated }) {
  const [stats, setStats]           = useState(null);
  const [statsLoading, setLoading]  = useState(true);
  const [editMode, setEditMode]     = useState(false);
  const [openCard, setOpenCard]     = useState(null); // "personal" | "goal" | "training" | "sleep"
  const [saving, setSaving]         = useState(false);

  // ── Локальные стейты редактирования ──────────────────────────────────────

  // Личные данные
  const [editWeight, setEditWeight] = useState("");
  const [editHeight, setEditHeight] = useState("");
  /** YYYY-MM-DD для input type="date" */
  const [editBirthDate, setEditBirthDate] = useState("");

  // Пол и активность
  const [editSex, setEditSex]                 = useState("male");
  const [editActivity, setEditActivity]       = useState("moderate");

  // Цель
  const [editGoal, setEditGoal]         = useState("");
  const [editGoalCustom, setEditGoalCustom] = useState("");

  // Тренировки
  const [editDays,      setEditDays]      = useState([]);
  const [editTrainType, setEditTrainType] = useState("strength");
  const [editIntensity, setEditIntensity] = useState("moderate");

  // Сон
  const [wakeH, setWakeH] = useState(8);
  const [wakeM, setWakeM] = useState(0);
  const [sleepH, setSleepH] = useState(23);
  const [sleepM, setSleepM] = useState(0);

  // ── Загрузка статистики ───────────────────────────────────────────────────

  useEffect(() => {
    if (!userId) { setStats(null); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await apiGet("/api/profile/stats", { user_id: userId });
        if (!cancelled) setStats(data);
      } catch {
        if (!cancelled) setStats(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  if (!profile?.exists) return null;

  const trainingDays = (profile.training_days || []).slice().sort((a, b) => a - b);
  const sleepHours   = calcSleepHours(profile.wake_time, profile.sleep_time);
  // ── Wiggle CSS ────────────────────────────────────────────────────────────

  const wiggleStyle1 = editMode && !openCard
    ? { animation: "profileWiggle 0.42s ease-in-out infinite", cursor: "pointer" }
    : {};
  const wiggleStyle2 = editMode && !openCard
    ? { animation: "profileWiggle2 0.42s ease-in-out infinite 0.07s", cursor: "pointer" }
    : {};
  const wiggleStyle3 = editMode && !openCard
    ? { animation: "profileWiggle 0.42s ease-in-out infinite 0.14s", cursor: "pointer" }
    : {};
  const wiggleStyle4 = editMode && !openCard
    ? { animation: "profileWiggle2 0.42s ease-in-out infinite 0.05s", cursor: "pointer" }
    : {};

  // ── Открыть карточку для редактирования ──────────────────────────────────

  function openSection(id) {
    if (!editMode || openCard === id) return;
    setOpenCard(id);

    if (id === "personal") {
      setEditWeight(String(profile.weight ?? ""));
      setEditHeight(String(profile.height ?? ""));
      setEditSex(profile.sex || "male");
      setEditActivity(profile.activity_level || "moderate");
      // Разбираем birth_date или вычисляем из age
      if (profile.birth_date && /^\d{4}-\d{2}-\d{2}/.test(profile.birth_date)) {
        setEditBirthDate(profile.birth_date.slice(0, 10));
      } else {
        const year = new Date().getFullYear() - (profile.age || 25);
        setEditBirthDate(`${year}-01-01`);
      }
    }

    if (id === "goal") {
      setEditGoal(profile.goal || "recomposition");
      setEditGoalCustom(profile.goal_custom || "");
    }

    if (id === "training") {
      setEditDays([...(profile.training_days || [])]);
      setEditTrainType(profile.training_type || "strength");
      setEditIntensity(profile.training_intensity || "moderate");
    }

    if (id === "sleep") {
      const [wh, wm] = (profile.wake_time || "08:00").split(":").map(Number);
      const [sh, sm] = (profile.sleep_time || "23:00").split(":").map(Number);
      setWakeH(wh); setWakeM(wm); setSleepH(sh); setSleepM(sm);
    }
  }

  function closeSection() { setOpenCard(null); }

  // ── Сохранение ────────────────────────────────────────────────────────────

  async function saveSection(id) {
    setSaving(true);
    try {
      const base = {
        user_id:       userId,
        goal:          profile.goal,
        wake_time:     profile.wake_time,
        sleep_time:    profile.sleep_time,
        training_days: profile.training_days,
        training_type: profile.training_type,
        training_intensity: profile.training_intensity,
        weight:        profile.weight,
        height:        profile.height,
        birth_date:    profile.birth_date,
        excluded_foods: profile.excluded_foods,
        budget:        profile.budget_tier,
        budget_weekly: profile.budget_weekly,
        budget_custom: profile.budget_custom,
        goal_custom:   profile.goal_custom,
        name:          profile.name,
        kitchen_type:   profile.kitchen_type,
        sex:            profile.sex || "male",
        activity_level: profile.activity_level || "moderate",
      };

      if (id === "personal") {
        let birthStr = (editBirthDate || "").trim();
        let age = ageFromBirthIso(birthStr);
        if (age == null) {
          birthStr = (profile.birth_date || "").slice(0, 10) || `${new Date().getFullYear() - 25}-01-01`;
          age = ageFromBirthIso(birthStr) ?? profile.age ?? 25;
        }
        Object.assign(base, {
          weight: parseFloat(editWeight) || profile.weight,
          height: parseFloat(editHeight) || profile.height,
          birth_date: birthStr,
          age,
          sex: editSex,
          activity_level: editActivity,
        });
      }
      if (id === "goal") {
        Object.assign(base, { goal: editGoal, goal_custom: editGoalCustom });
      }
      if (id === "training") {
        Object.assign(base, {
          training_days: editDays,
          training_type: editTrainType,
          training_intensity: editIntensity,
        });
      }
      if (id === "sleep") {
        Object.assign(base, {
          wake_time:  `${pad2(wakeH)}:${pad2(wakeM)}`,
          sleep_time: `${pad2(sleepH)}:${pad2(sleepM)}`,
        });
      }

      await apiPut("/api/profile", base);
      if (onProfileUpdated) await onProfileUpdated();
    } catch (e) {
      console.error("Ошибка сохранения:", e);
    } finally {
      setSaving(false);
      setOpenCard(null);
    }
  }

  // ── Вспомогательный рендер ────────────────────────────────────────────────

  function isDimmed(id) { return openCard !== null && openCard !== id; }

  function ChipRow({ options, value, onChange, colorMap }) {
    return (
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {options.map(({ key, label }) => {
          const active = value === key;
          const sem = active ? (colorMap?.[key] || "info") : null;
          const act = sem ? CHIP_ACTIVE[sem] || CHIP_ACTIVE.info : null;
          return (
            <button
              key={key}
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(key); }}
              style={{
                flex: 1, padding: "7px 4px",
                borderRadius: "var(--r-md)",
                fontSize: 12, fontWeight: 500, cursor: "pointer", textAlign: "center",
                border: "0.5px solid",
                ...(active && act
                  ? {
                      borderColor: act.borderColor,
                      background: act.background,
                      color: act.color,
                    }
                  : {
                      borderColor: "var(--c-border-mid)",
                      background: "var(--c-surface2)",
                      color: "var(--c-text-secondary)",
                    }),
                transition: "all 0.15s",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    );
  }

  function SaveBtn({ id }) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); saveSection(id); }}
        disabled={saving}
        style={{
          width: "100%", marginTop: 12, padding: "10px",
          borderRadius: 999,
          background: "var(--c-accent)",
          color: "#fff",
          border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer",
          opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? "Сохраняем…" : "Сохранить"}
      </button>
    );
  }

  function Divider() {
    return <div style={{
      height: "0.5px", background: "var(--c-border-mid)", margin: "10px 0",
    }} />;
  }

  function SubLabel({ children }) {
    return <div style={{
      fontSize: 11, color: "var(--c-text-secondary)", marginBottom: 6,
    }}>{children}</div>;
  }

  // Барабаны часов и минут (сон)
  const HOURS24 = Array.from({ length: 24 }, (_, i) => pad2(i));
  const MINS    = Array.from({ length: 60 }, (_, i) => pad2(i));

  const sleepDiff = (() => {
    const wMin = wakeH * 60 + wakeM;
    const sMin = sleepH * 60 + sleepM;
    const diff = sMin > wMin ? 24 * 60 - sMin + wMin : wMin - sMin;
    return (diff / 60).toFixed(1);
  })();

  // ─────────────────────────────────────────────────────────────────────────
  // Рендер
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Глобальные стили wiggle — инжектируем один раз */}
      <style>{`
        @keyframes profileWiggle {
          0%,100%{transform:rotate(0)}
          25%{transform:rotate(-1.1deg)}
          75%{transform:rotate(1.1deg)}
        }
        @keyframes profileWiggle2 {
          0%,100%{transform:rotate(0)}
          25%{transform:rotate(1.2deg)}
          75%{transform:rotate(-1deg)}
        }
      `}</style>

      <div className="modal-backdrop" role="presentation" onClick={onClose}>
        <div
          className="modal-dialog"
          role="dialog"
          aria-label="Профиль"
          style={{ maxHeight: "min(92vh, 780px)" }}
          onClick={(e) => e.stopPropagation()}
        >

          {/* ── Шапка ── */}
          <div className="modal-head">
            <div className="modal-head-text">
              <h2 className="modal-title">Профиль</h2>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                type="button"
                onClick={() => {
                  if (editMode && openCard) { closeSection(); return; }
                  setEditMode((v) => !v);
                  setOpenCard(null);
                }}
                style={{
                  fontSize: 13, fontWeight: 500, background: "none", border: "none",
                  cursor: "pointer", padding: "4px 0",
                  color: editMode
                    ? "var(--c-danger)"
                    : "var(--c-accent)",
                }}
              >
                {editMode ? "Готово" : "Изменить"}
              </button>
              <button type="button" className="modal-close" onClick={onClose} aria-label="Закрыть">
                ×
              </button>
            </div>
          </div>

          <div className="modal-body">

            {/* ══ Блок 1: Личные данные ═══════════════════════════════════ */}
            <div
              className="profile-modal-block"
              onClick={() => openSection("personal")}
              style={{
                cursor: editMode ? "pointer" : "default",
                opacity: isDimmed("personal") ? 0.45 : 1,
                pointerEvents: isDimmed("personal") ? "none" : undefined,
                transition: "opacity 0.2s",
                transformOrigin: "center",
                ...wiggleStyle1,
              }}
            >
              {/* Аватар + имя */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: "50%",
                  background: "var(--c-accent-light)", color: "var(--c-accent)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 500, fontSize: 17, flexShrink: 0,
                }}>
                  {(profile.name || "?").split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 17 }}>{profile.name || "Без имени"}</div>
                  <div style={{ fontSize: 13, color: "var(--c-text-secondary)" }}>
                    {profile.weight ?? "—"} кг · {profile.height ?? "—"} см
                  </div>
                </div>
              </div>

              {/* КБЖУ */}
              {statsLoading ? (
                <div style={{ fontSize: 13, color: "var(--c-text-secondary)" }}>Загрузка…</div>
              ) : stats && stats.days_tracked > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                  {[
                    { val: stats.avg_kcal,         lbl: "ккал" },
                    { val: `${stats.avg_protein} г`, lbl: "белки" },
                    { val: `${stats.avg_fat} г`,     lbl: "жиры" },
                    { val: `${stats.avg_carbs} г`,   lbl: "углеводы" },
                  ].map(({ val, lbl }) => (
                    <div key={lbl} style={{
                      background: "var(--c-surface2)",
                      borderRadius: "var(--r-md)",
                      padding: "8px 4px", textAlign: "center",
                    }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--c-text-primary)" }}>{val}</div>
                      <div style={{ fontSize: 10, color: "var(--c-text-secondary)", marginTop: 2 }}>{lbl}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "var(--c-text-secondary)" }}>
                  КБЖУ появятся после первых записей в дневнике
                </div>
              )}

              {/* Редактор личных данных */}
              {openCard === "personal" && (
                <div onClick={(e) => e.stopPropagation()}>
                  <Divider />

                  {/* Вес и рост — ввод с клавиатуры */}
                  <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                    {[
                      { label: "Вес", unit: "кг", val: editWeight, set: setEditWeight, min: 30, max: 300 },
                      { label: "Рост", unit: "см", val: editHeight, set: setEditHeight, min: 100, max: 250 },
                    ].map(({ label, unit, val, set, min, max }) => (
                      <div key={label} style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: "var(--c-text-secondary)", marginBottom: 4 }}>{label}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <input
                            type="number"
                            inputMode="decimal"
                            value={val}
                            min={min}
                            max={max}
                            onChange={(e) => set(e.target.value)}
                            style={{
                              flex: 1, padding: "8px 10px",
                              borderRadius: "var(--r-md)",
                              border: "0.5px solid var(--c-border-mid)",
                              background: "var(--c-surface2)",
                              color: "var(--c-text-primary)",
                              fontSize: 15, fontWeight: 500,
                              appearance: "none", MozAppearance: "textfield",
                            }}
                          />
                          <span style={{ fontSize: 12, color: "var(--c-text-secondary)" }}>{unit}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <SubLabel>Дата рождения</SubLabel>
                  <input
                    type="date"
                    required
                    min="1930-01-01"
                    max={todayIsoLocal()}
                    value={editBirthDate}
                    onChange={(e) => setEditBirthDate(e.target.value)}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "8px 10px",
                      borderRadius: "var(--r-md)",
                      border: "0.5px solid var(--c-border-mid)",
                      background: "var(--c-surface2)",
                      color: "var(--c-text-primary)",
                      fontSize: 15,
                      fontWeight: 500,
                      fontFamily: "var(--font)",
                    }}
                  />

                  {/* Пол */}
                  <SubLabel>Пол</SubLabel>
                  <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                    {[{ id: "male", label: "Мужской" }, { id: "female", label: "Женский" }].map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setEditSex(s.id)}
                        style={{
                          flex: 1, padding: "9px 12px",
                          borderRadius: "var(--r-md)",
                          border: editSex === s.id ? "1.5px solid var(--c-accent)" : "0.5px solid var(--c-border-mid)",
                          background: editSex === s.id ? "color-mix(in srgb, var(--c-accent) 10%, var(--c-surface))" : "var(--c-surface2)",
                          color: editSex === s.id ? "var(--c-accent)" : "var(--c-text-primary)",
                          fontFamily: "var(--font)", fontSize: 13, fontWeight: 600, cursor: "pointer",
                        }}
                      >{s.label}</button>
                    ))}
                  </div>

                  {/* Уровень активности */}
                  <SubLabel>Уровень активности</SubLabel>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                    {[
                      { id: "sedentary",   label: "Сидячий",            coef: "×1.2" },
                      { id: "light",       label: "Лёгкая активность",  coef: "×1.375" },
                      { id: "moderate",    label: "Умеренная",          coef: "×1.55" },
                      { id: "active",      label: "Высокая",            coef: "×1.725" },
                      { id: "very_active", label: "Очень высокая",      coef: "×1.9" },
                    ].map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setEditActivity(a.id)}
                        style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          padding: "9px 12px", borderRadius: "var(--r-md)",
                          border: editActivity === a.id ? "1.5px solid var(--c-accent)" : "0.5px solid var(--c-border-mid)",
                          background: editActivity === a.id ? "color-mix(in srgb, var(--c-accent) 10%, var(--c-surface))" : "var(--c-surface2)",
                          color: editActivity === a.id ? "var(--c-accent)" : "var(--c-text-primary)",
                          fontFamily: "var(--font)", fontSize: 13, fontWeight: 500, cursor: "pointer",
                        }}
                      >
                        <span>{a.label}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.6 }}>{a.coef}</span>
                      </button>
                    ))}
                  </div>

                  <SaveBtn id="personal" />
                </div>
              )}
            </div>

            {/* ══ Блок 2: Цель ════════════════════════════════════════════ */}
            <div
              className="profile-modal-block"
              onClick={() => openSection("goal")}
              style={{
                cursor: editMode ? "pointer" : "default",
                opacity: isDimmed("goal") ? 0.45 : 1,
                pointerEvents: isDimmed("goal") ? "none" : undefined,
                transition: "opacity 0.2s",
                transformOrigin: "center",
                ...wiggleStyle2,
              }}
            >
              <div style={{
                fontSize: 11, fontWeight: 500, textTransform: "uppercase",
                letterSpacing: "0.06em", color: "var(--c-text-secondary)", marginBottom: 8,
              }}>
                Цель
              </div>

              {openCard !== "goal" ? (
                <>
                  <div style={{
                    display: "inline-flex", alignItems: "center",
                    background: "var(--c-accent-light)",
                    color: "var(--c-accent)",
                    borderRadius: 999, padding: "5px 14px",
                    fontSize: 13, fontWeight: 500,
                  }}>
                    {GOAL_LABEL[profile.goal] || profile.goal}
                  </div>
                  {profile.goal_custom && (
                    <div style={{ fontSize: 13, color: "var(--c-text-secondary)", marginTop: 8 }}>
                      {profile.goal_custom}
                    </div>
                  )}
                </>
              ) : (
                <div onClick={(e) => e.stopPropagation()}>
                  <Divider />
                  {[
                    { key: "recomposition", label: "Рекомпозиция", desc: "Набор мышц и снижение жира" },
                    { key: "mass_gain",     label: "Набор массы",  desc: "Профицит, акцент на рост" },
                    { key: "cutting",       label: "Сушка",        desc: "Дефицит при сохранении мышц" },
                    { key: "custom",        label: "Своя цель",    desc: "Опишешь своими словами" },
                  ].map(({ key, label, desc }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setEditGoal(key)}
                      style={{
                        width: "100%", padding: "9px 12px", marginBottom: 6,
                        borderRadius: "var(--r-md)",
                        border: "0.5px solid",
                        borderColor: editGoal === key
                          ? "var(--c-accent)"
                          : "var(--c-border-mid)",
                        background: editGoal === key
                          ? "var(--c-accent-light)"
                          : "var(--c-surface2)",
                        textAlign: "left", cursor: "pointer",
                      }}
                    >
                      <div style={{
                        fontSize: 13, fontWeight: 500,
                        color: editGoal === key ? "var(--c-accent)" : "var(--c-text-primary)",
                      }}>{label}</div>
                      <div style={{
                        fontSize: 11, marginTop: 2,
                        color: editGoal === key ? "var(--c-accent)" : "var(--c-text-secondary)",
                        opacity: editGoal === key ? 0.85 : 1,
                      }}>{desc}</div>
                    </button>
                  ))}
                  {editGoal === "custom" && (
                    <textarea
                      value={editGoalCustom}
                      onChange={(e) => setEditGoalCustom(e.target.value)}
                      placeholder="Опиши свою цель…"
                      rows={3}
                      style={{
                        width: "100%", padding: "8px 10px", marginTop: 4,
                        borderRadius: "var(--r-md)",
                        border: "0.5px solid var(--c-border-mid)",
                        background: "var(--c-surface2)",
                        color: "var(--c-text-primary)",
                        fontSize: 13, resize: "vertical",
                      }}
                    />
                  )}
                  <SaveBtn id="goal" />
                </div>
              )}
            </div>

            {/* ══ Блок 3: Тренировки ══════════════════════════════════════ */}
            <div
              className="profile-modal-block"
              onClick={() => openSection("training")}
              style={{
                cursor: editMode ? "pointer" : "default",
                opacity: isDimmed("training") ? 0.45 : 1,
                pointerEvents: isDimmed("training") ? "none" : undefined,
                transition: "opacity 0.2s",
                transformOrigin: "center",
                ...wiggleStyle3,
              }}
            >
              <div style={{
                fontSize: 11, fontWeight: 500, textTransform: "uppercase",
                letterSpacing: "0.06em", color: "var(--c-text-secondary)", marginBottom: 8,
              }}>
                Тренировки
              </div>

              {/* Дни — просмотр */}
              <div style={{ display: "flex", gap: 5, marginBottom: openCard === "training" ? 0 : 6 }}>
                {WD.map((day, idx) => {
                  const isOn = openCard === "training"
                    ? editDays.includes(idx)
                    : trainingDays.includes(idx);
                  return (
                    <div
                      key={day}
                      onClick={openCard === "training"
                        ? (e) => {
                            e.stopPropagation();
                            setEditDays((prev) =>
                              prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx]
                            );
                          }
                        : undefined
                      }
                      style={{
                        width: 34, height: 34, borderRadius: "50%",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12, fontWeight: 600,
                        border: "0.5px solid var(--c-border-mid)",
                        background: isOn ? "var(--c-accent-light)" : "var(--c-surface2)",
                        color:      isOn ? "var(--c-accent)"       : "var(--c-text-secondary)",
                        cursor: openCard === "training" ? "pointer" : "default",
                        transition: "background 0.15s, color 0.15s",
                        userSelect: "none",
                      }}
                    >
                      {day}
                    </div>
                  );
                })}
              </div>

              {openCard !== "training" && (
                <div style={{ fontSize: 12, color: "var(--c-text-secondary)" }}>
                  {profile.training_type === "strength"  ? "Силовые" :
                   profile.training_type === "cardio"    ? "Кардио"  :
                   profile.training_type === "mixed"     ? "Смешанные" : "—"}
                  {profile.training_intensity ? " · " +
                    (profile.training_intensity === "light"    ? "Лёгкая интенсивность"  :
                     profile.training_intensity === "moderate" ? "Средняя интенсивность" :
                     "Высокая интенсивность")
                  : ""}
                </div>
              )}

              {openCard === "training" && (
                <div onClick={(e) => e.stopPropagation()}>
                  <Divider />
                  <SubLabel>Тип тренировок</SubLabel>
                  <ChipRow
                    options={[
                      { key: "strength", label: "Силовые" },
                      { key: "cardio",   label: "Кардио" },
                      { key: "mixed",    label: "Смешанные" },
                    ]}
                    value={editTrainType}
                    onChange={setEditTrainType}
                    colorMap={{ strength: "info", cardio: "info", mixed: "info" }}
                  />
                  <SubLabel>Интенсивность</SubLabel>
                  <ChipRow
                    options={[
                      { key: "light",    label: "Лёгкая" },
                      { key: "moderate", label: "Средняя" },
                      { key: "high",     label: "Высокая" },
                    ]}
                    value={editIntensity}
                    onChange={setEditIntensity}
                    colorMap={{ light: "success", moderate: "warning", high: "danger" }}
                  />
                  <SaveBtn id="training" />
                </div>
              )}
            </div>

            {/* ══ Блок 4: Сон ═════════════════════════════════════════════ */}
            <div
              className="profile-modal-block"
              onClick={() => openSection("sleep")}
              style={{
                cursor: editMode ? "pointer" : "default",
                opacity: isDimmed("sleep") ? 0.45 : 1,
                pointerEvents: isDimmed("sleep") ? "none" : undefined,
                transition: "opacity 0.2s",
                transformOrigin: "center",
                ...wiggleStyle4,
              }}
            >
              <div style={{
                fontSize: 11, fontWeight: 500, textTransform: "uppercase",
                letterSpacing: "0.06em", color: "var(--c-text-secondary)", marginBottom: 8,
              }}>
                Режим сна
              </div>

              {/* Просмотр */}
              {openCard !== "sleep" ? (
                <div style={{ display: "flex", gap: 8 }}>
                  {[
                    { lbl: "Подъём", val: profile.wake_time || "—" },
                    { lbl: "Отбой",  val: profile.sleep_time || "—" },
                    {
                      lbl: "Сон",
                      val: sleepHours ? `${sleepHours} ч` : "—",
                      accent: sleepHours && parseFloat(sleepHours) >= 7,
                    },
                  ].map(({ lbl, val, accent }) => (
                    <div key={lbl} style={{
                      flex: 1, background: "var(--c-surface2)",
                      borderRadius: "var(--r-md)", padding: "8px 6px",
                    }}>
                      <div style={{ fontSize: 10, color: "var(--c-text-secondary)", marginBottom: 3 }}>{lbl}</div>
                      <div style={{
                        fontSize: 14, fontWeight: 500,
                        color: accent ? "var(--c-accent)" : "var(--c-text-primary)",
                      }}>{val}</div>
                    </div>
                  ))}
                </div>
              ) : (
                /* Редактор: барабаны расходятся — подъём влево, отбой вправо */
                <div onClick={(e) => e.stopPropagation()}>
                  <Divider />
                  <div
                    style={{
                      display: "flex",
                      width: "100%",
                      alignItems: "stretch",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    {/* Колонка «Подъём» — прижата к левому краю */}
                    <div
                      style={{
                        flex: "1 1 0",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                        minWidth: 0,
                      }}
                    >
                      <span style={{ fontSize: 11, color: "var(--c-text-secondary)", marginBottom: 6 }}>
                        Подъём
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                        <DrumPicker items={HOURS24} value={pad2(wakeH)} onChange={(v) => setWakeH(Number(v))} width={64} />
                        <span style={{ fontSize: 22, fontWeight: 500, color: "var(--c-text-secondary)", padding: "0 2px" }}>:</span>
                        <DrumPicker items={MINS} value={pad2(wakeM)} onChange={(v) => setWakeM(Number(v))} width={64} />
                      </div>
                    </div>

                    {/* Центральный разделитель */}
                    <div
                      style={{
                        alignSelf: "stretch",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        paddingTop: 18,
                        color: "var(--c-text-tertiary)",
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: "0.12em",
                        flexShrink: 0,
                      }}
                      aria-hidden
                    >
                      <span style={{ lineHeight: 1.2 }}>│</span>
                    </div>

                    {/* Колонка «Отбой» — прижата к правому краю */}
                    <div
                      style={{
                        flex: "1 1 0",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        minWidth: 0,
                      }}
                    >
                      <span style={{ fontSize: 11, color: "var(--c-text-secondary)", marginBottom: 6 }}>
                        Отбой
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                        <DrumPicker items={HOURS24} value={pad2(sleepH)} onChange={(v) => setSleepH(Number(v))} width={64} />
                        <span style={{ fontSize: 22, fontWeight: 500, color: "var(--c-text-secondary)", padding: "0 2px" }}>:</span>
                        <DrumPicker items={MINS} value={pad2(sleepM)} onChange={(v) => setSleepM(Number(v))} width={64} />
                      </div>
                    </div>
                  </div>
                  <div style={{
                    fontSize: 12, color: "var(--c-text-secondary)",
                    textAlign: "center", marginTop: 10,
                  }}>
                    Сон: {sleepDiff} ч
                  </div>
                  <SaveBtn id="sleep" />
                </div>
              )}
            </div>

            {/* ══ Исключения ══════════════════════════════════════════════ */}
            {(profile.excluded_foods || []).length > 0 && (
              <div style={{
                background: "var(--c-surface)",
                border: "0.5px solid var(--c-border-mid)",
                borderRadius: "var(--r-lg)",
                padding: "14px 16px", marginBottom: 10,
                opacity: editMode ? 0.35 : 1,
                transition: "opacity 0.2s",
                pointerEvents: editMode ? "none" : undefined,
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 500, textTransform: "uppercase",
                  letterSpacing: "0.06em", color: "var(--c-text-secondary)", marginBottom: 8,
                }}>
                  Исключения из плана
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--c-text-primary)" }}>
                  {(profile.excluded_foods || []).join(", ")}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}