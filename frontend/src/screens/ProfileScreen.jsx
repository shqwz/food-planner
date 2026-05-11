import { useEffect, useRef, useState } from "react";
import { apiGet, apiPut } from "../api/client";

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

const CATEGORY_COLORS = [
  "#4A9EDB","#63C87A","#F5A623","#E05C5C","#9B7FD4","#5BB8C4","#A0A0A0",
];

const MONTHS = [
  "Январь","Февраль","Март","Апрель","Май","Июнь",
  "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь",
];

const ITEM_H = 40; // высота одного элемента барабана в px

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

function describeArc(cx, cy, r, startAngle, endAngle) {
  const s = { x: cx + r * Math.cos(startAngle), y: cy + r * Math.sin(startAngle) };
  const e = { x: cx + r * Math.cos(endAngle),   y: cy + r * Math.sin(endAngle) };
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${endAngle - startAngle > Math.PI ? 1 : 0} 1 ${e.x} ${e.y}`;
}

function pad2(n) { return String(n).padStart(2, "0"); }

/** Сегодня по локальному календарю устройства — для max у type="date" */
function todayIsoLocal() {
  const t = new Date();
  return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
}

/** Полных лет на сегодня по дате рождения YYYY-MM-DD */
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

// ─────────────────────────────────────────────────────────────────────────────
// Барабанный пикер (drum scroll)
// ─────────────────────────────────────────────────────────────────────────────

function wrapIndex(i, n) {
  if (!n) return 0;
  return ((Math.round(i) % n) + n) % n;
}

/**
 * Барабан выбора: один логический круг items.
 *
 * При circular список в DOM состоит из ДВУХ одинаковых сегментов подряд (2×n строк).
 * Скролл «петли» поддерживается сдвигом translate без анимации, когда центр доходит до
 * краев этой двойной ленты — визуально непрерывно, данных в коде один items.
 */
function DrumPicker({ items, value, onChange, width = 72, circular = true }) {
  const innerRef = useRef(null);
  const dragRef  = useRef(null);

  const idx = items.indexOf(value);
  const selIdx = idx === -1 ? 0 : idx;
  const n = items.length;

  const totalRows = circular && n > 0 ? n * 2 : n;

  // translateY: центр окна совпадает с inner-строкой virtualRow
  const yForVirtual = (virtualRow) => (2 - virtualRow) * ITEM_H;

  /** Центральная строка для canonical: нижний круг (первая копия 0…n‑1 сверху, вторая n…2n‑1 под ней). */
  const stableVirtualRow = (canonicalIdx) => n + canonicalIdx;

  /** Держим центр между n и 2n−1 «строкой»: прыжок на ±n высот одинакового паттерна без анимации. */
  function recenterCircularTranslate(rawY, el, keepTransitionFalse = true) {
    if (!circular || n <= 0 || !el) return rawY;
    let newY = rawY;
    let vr = Math.round(2 - newY / ITEM_H);
    while (vr < n) {
      newY += n * ITEM_H;
      vr = Math.round(2 - newY / ITEM_H);
    }
    while (vr >= 2 * n) {
      newY -= n * ITEM_H;
      vr = Math.round(2 - newY / ITEM_H);
    }
    if (keepTransitionFalse) el.style.transition = "none";
    el.style.transform = `translateY(${newY}px)`;
    return newY;
  }

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    el.style.transition = "none";
    if (circular && n > 0) {
      el.style.transform = `translateY(${yForVirtual(stableVirtualRow(selIdx))}px)`;
    } else {
      el.style.transform = `translateY(${yForVirtual(selIdx)}px)`;
    }
  }, []); // только при маунте

  function snapToNearest(rawY) {
    const live = 2 - rawY / ITEM_H;
    const picked = circular && n > 0 ? wrapIndex(live, n) : Math.max(0, Math.min(n - 1, Math.round(live)));
    const el = innerRef.current;
    if (!el) return;
    el.style.transition = "transform 0.18s ease";
    const targetY =
      circular && n > 0 ? yForVirtual(stableVirtualRow(picked)) : yForVirtual(picked);
    el.style.transform = `translateY(${targetY}px)`;
    onChange(items[picked]);
  }

  function currentY() {
    const el = innerRef.current;
    const t = el?.style.transform;
    const m = t?.match(/translateY\(([-\d.]+)px\)/);
    if (m) return parseFloat(m[1]);
    if (!el) return 0;
    return circular && n > 0
      ? yForVirtual(stableVirtualRow(selIdx))
      : yForVirtual(selIdx);
  }

  function onPointerDown(e) {
    e.preventDefault();
    const startY = e.touches ? e.touches[0].clientY : e.clientY;
    const startTranslate = currentY();
    dragRef.current = { initialClientY: startY, initialTranslateY: startTranslate };
    const el = innerRef.current;
    if (el) el.style.transition = "none";
  }

  function onPointerMove(e) {
    if (!dragRef.current || !innerRef.current) return;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const dy = clientY - dragRef.current.initialClientY;
    let newY = dragRef.current.initialTranslateY + dy;
    const el = innerRef.current;
    if (circular && n > 0) {
      newY = recenterCircularTranslate(newY, el);
    }
    el.style.transition = "none";
    el.style.transform = `translateY(${newY}px)`;
    const live = 2 - newY / ITEM_H;
    const liveIdx =
      circular && n > 0
        ? wrapIndex(live, n)
        : Math.max(0, Math.min(n - 1, Math.round(live)));
    onChange(items[liveIdx]);
  }

  function onPointerUp(e) {
    if (!dragRef.current) return;
    snapToNearest(currentY());
    dragRef.current = null;
  }

  return (
    <div
      style={{
        width, height: ITEM_H * 5, overflow: "hidden", position: "relative",
        borderRadius: "var(--r-md)",
        background: "var(--c-surface2)",
        touchAction: "none", userSelect: "none", cursor: "grab",
      }}
      onMouseDown={onPointerDown}
      onMouseMove={onPointerMove}
      onMouseUp={onPointerUp}
      onMouseLeave={onPointerUp}
      onTouchStart={onPointerDown}
      onTouchMove={onPointerMove}
      onTouchEnd={onPointerUp}
    >
      {/* Контент барабана (при circular — несколько копий списка подряд) */}
      <div ref={innerRef} style={{ display: "flex", flexDirection: "column" }}>
        {Array.from({ length: totalRows }, (_, r) => {
          const canonicalIdx = n > 0 ? ((r % n) + n) % n : 0;
          const item = items[canonicalIdx];
          const highlighted = circular ? item === value : r === selIdx && item === value;
          return (
            <div
              key={`r-${r}`}
              style={{
                height: ITEM_H,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: highlighted ? 20 : 15,
                fontWeight: highlighted ? 500 : 400,
                color: highlighted
                  ? "var(--c-text-primary)"
                  : "var(--c-text-secondary)",
                transition: "font-size 0.1s, color 0.1s",
                flexShrink: 0,
              }}
            >
              {item}
            </div>
          );
        })}
      </div>

      {/* Затухание сверху */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: ITEM_H * 2,
        background: "linear-gradient(to bottom, var(--c-surface2), transparent)",
        pointerEvents: "none",
      }} />
      {/* Затухание снизу */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: ITEM_H * 2,
        background: "linear-gradient(to top, var(--c-surface2), transparent)",
        pointerEvents: "none",
      }} />
      {/* Линия сверху выделения */}
      <div style={{
        position: "absolute", top: ITEM_H * 2, left: 0, right: 0,
        height: "0.5px", background: "var(--c-border-mid)", pointerEvents: "none",
      }} />
      {/* Линия снизу выделения */}
      <div style={{
        position: "absolute", bottom: ITEM_H * 2, left: 0, right: 0,
        height: "0.5px", background: "var(--c-border-mid)", pointerEvents: "none",
      }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Донат-диаграмма
// ─────────────────────────────────────────────────────────────────────────────

function DonutChart({ categories, total }) {
  const cx = 54, cy = 54, r = 38, sw = 14, gap = 0.04;
  if (!categories?.length || total === 0) {
    return (
      <svg width="108" height="108" viewBox="0 0 108 108" aria-hidden="true">
        <circle cx={cx} cy={cy} r={r} fill="none"
          stroke="var(--c-border-mid)" strokeWidth={sw} />
        <text x={cx} y={cy + 5} textAnchor="middle" fontSize="13"
          fill="var(--c-text-secondary)" fontFamily="var(--font)">—</text>
      </svg>
    );
  }
  const segments = [];
  let cur = -Math.PI / 2;
  categories.forEach((cat, i) => {
    const sweep = (cat.amount / total) * 2 * Math.PI - gap;
    if (sweep <= 0) return;
    segments.push({
      path:  describeArc(cx, cy, r, cur, cur + sweep),
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
    });
    cur += (cat.amount / total) * 2 * Math.PI;
  });
  return (
    <svg width="108" height="108" viewBox="0 0 108 108" aria-hidden="true">
      <circle cx={cx} cy={cy} r={r} fill="none"
        stroke="var(--c-border-mid)" strokeWidth={sw} />
      {segments.map((s, i) => (
        <path key={i} d={s.path} fill="none" stroke={s.color}
          strokeWidth={sw} strokeLinecap="round" />
      ))}
      <text x={cx} y={cy - 5} textAnchor="middle" fontSize="13" fontWeight="500"
        fill="var(--c-text-primary)" fontFamily="var(--font)">
        {total.toLocaleString("ru-RU")}
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize="10"
        fill="var(--c-text-secondary)" fontFamily="var(--font)">
        ₽ / нед
      </text>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Карточка-секция
// ─────────────────────────────────────────────────────────────────────────────

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
  const spendCategories = stats?.spend_by_category || [];
  const spendTotal      = stats?.spend_total || 0;
  const budgetWeekly    = Math.round(profile.budget_weekly || 0);
  const budgetLeft      = budgetWeekly > 0 ? budgetWeekly - spendTotal : null;

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
        kitchen_type:  profile.kitchen_type,
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
                    {profile.age ?? "—"} лет · {profile.weight ?? "—"} кг · {profile.height ?? "—"} см
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
                  <div style={{
                    fontSize: 12, color: "var(--c-text-secondary)",
                    marginTop: 8,
                  }}>
                    {(() => {
                      const a = ageFromBirthIso(editBirthDate);
                      return a != null ? `Полных лет: ${a}` : "Укажи дату";
                    })()}
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

            {/* ══ Питание за неделю ═══════════════════════════════════════ */}
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
                letterSpacing: "0.06em", color: "var(--c-text-secondary)", marginBottom: 10,
              }}>
                Питание за неделю
              </div>
              {statsLoading ? (
                <div style={{ fontSize: 13, color: "var(--c-text-secondary)" }}>Загрузка…</div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <DonutChart categories={spendCategories} total={spendTotal} />
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                    {spendCategories.length === 0 ? (
                      <div style={{ fontSize: 13, color: "var(--c-text-secondary)" }}>
                        Расходы появятся после первых покупок
                      </div>
                    ) : (
                      <>
                        {spendCategories.slice(0, 4).map((cat, i) => (
                          <div key={cat.key} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12 }}>
                            <span style={{
                              width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                              background: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                            }} />
                            <span style={{ flex: 1 }}>{cat.label}</span>
                            <span style={{ fontWeight: 500, color: "var(--c-text-secondary)" }}>
                              {cat.amount.toLocaleString("ru-RU")} ₽
                            </span>
                          </div>
                        ))}
                        {spendCategories.length > 4 && (
                          <div style={{ fontSize: 11, color: "var(--c-text-secondary)" }}>
                            + ещё {spendCategories.length - 4}
                          </div>
                        )}
                      </>
                    )}
                    {budgetLeft !== null && (
                      <div style={{
                        marginTop: 4, paddingTop: 6,
                        borderTop: "0.5px solid var(--c-border-mid)",
                        display: "flex", justifyContent: "space-between",
                        fontSize: 11, color: "var(--c-text-secondary)",
                      }}>
                        <span>Бюджет {budgetWeekly.toLocaleString("ru-RU")} ₽</span>
                        <span style={{
                          fontWeight: 500,
                          color: budgetLeft >= 0 ? "var(--c-accent)" : "var(--c-danger)",
                        }}>
                          {budgetLeft >= 0
                            ? `−${budgetLeft.toLocaleString("ru-RU")} ₽`
                            : `+${Math.abs(budgetLeft).toLocaleString("ru-RU")} ₽`}
                        </span>
                      </div>
                    )}
                  </div>
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