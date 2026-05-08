import { useEffect, useState } from "react";
import { apiGet } from "../api/client";

// ── Константы ─────────────────────────────────────────────────────────────────

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

// Цвета для категорий расходов — порядок совпадает с сортировкой по убыванию суммы
const CATEGORY_COLORS = ["#4A9EDB", "#63C87A", "#F5A623", "#E05C5C", "#9B7FD4", "#5BB8C4", "#A0A0A0"];

// ── Вспомогательные функции ───────────────────────────────────────────────────

/**
 * Считает время сна в часах по wake_time и sleep_time.
 * Корректно обрабатывает ночные переходы (например отбой в 23:00, подъём в 07:00).
 */
function calcSleepHours(wakeTime, sleepTime) {
  try {
    const [wh, wm] = wakeTime.split(":").map(Number);
    const [sh, sm] = sleepTime.split(":").map(Number);
    const wakeMin  = wh * 60 + wm;
    const sleepMin = sh * 60 + sm;
    // Если отбой после полуночи (sleepMin < wakeMin), добавляем сутки
    const diff = sleepMin > wakeMin
      ? 24 * 60 - sleepMin + wakeMin
      : wakeMin - sleepMin;
    return (diff / 60).toFixed(1);
  } catch {
    return null;
  }
}

/**
 * Вычисляет время последнего приёма пищи = sleep_time - 2 часа.
 */
function calcLastMealTime(sleepTime) {
  try {
    const [sh, sm] = sleepTime.split(":").map(Number);
    let total = sh * 60 + sm - 120;
    if (total < 0) total += 24 * 60;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  } catch {
    return "21:00";
  }
}

/**
 * Строит SVG-путь для дуги донат-диаграммы.
 * cx, cy — центр; r — радиус; startAngle, endAngle — углы в радианах.
 */
function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = {
    x: cx + r * Math.cos(startAngle),
    y: cy + r * Math.sin(startAngle),
  };
  const end = {
    x: cx + r * Math.cos(endAngle),
    y: cy + r * Math.sin(endAngle),
  };
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

// ── Донат-диаграмма ───────────────────────────────────────────────────────────

function DonutChart({ categories, total }) {
  const cx = 54;
  const cy = 54;
  const r  = 38;
  const strokeWidth = 14;
  const gap = 0.04; // зазор между сегментами в радианах

  if (!categories || categories.length === 0 || total === 0) {
    // Пустое состояние — серый круг
    return (
      <svg width="108" height="108" viewBox="0 0 108 108" aria-hidden="true">
        <circle cx={cx} cy={cy} r={r} fill="none"
          stroke="var(--c-border-mid)" strokeWidth={strokeWidth} />
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="13" fontWeight="500"
          fill="var(--c-text-secondary)" fontFamily="var(--font)">—</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="10"
          fill="var(--c-text-secondary)" fontFamily="var(--font)">нет данных</text>
      </svg>
    );
  }

  // Строим сегменты
  const segments = [];
  let currentAngle = -Math.PI / 2; // начинаем сверху

  categories.forEach((cat, i) => {
    const fraction = cat.amount / total;
    const sweep    = fraction * 2 * Math.PI - gap;
    if (sweep <= 0) return;

    segments.push({
      path:  describeArc(cx, cy, r, currentAngle, currentAngle + sweep),
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
    });
    currentAngle += fraction * 2 * Math.PI;
  });

  return (
    <svg width="108" height="108" viewBox="0 0 108 108" aria-hidden="true">
      {/* Фоновый круг */}
      <circle cx={cx} cy={cy} r={r} fill="none"
        stroke="var(--c-border-mid)" strokeWidth={strokeWidth} />
      {/* Сегменты */}
      {segments.map((seg, i) => (
        <path
          key={i}
          d={seg.path}
          fill="none"
          stroke={seg.color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      ))}
      {/* Центральные цифры — токены --c-text-* (в тёмной теме светлые) */}
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

// ── Секция-карточка ───────────────────────────────────────────────────────────

function Section({ label, children }) {
  return (
    <div className="card" style={{ padding: 14, marginBottom: 10 }}>
      {label && (
        <div style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--color-text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 10,
        }}>
          {label}
        </div>
      )}
      {children}
    </div>
  );
}

// ── Основной компонент ────────────────────────────────────────────────────────

export default function ProfileScreen({ profile, onClose, onEdit, userId }) {
  const [stats, setStats]       = useState(null);
  const [statsLoading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setStats(null);
      setLoading(false);
      return;
    }
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
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!profile?.exists) return null;

  const trainingDays = (profile.training_days || []).slice().sort((a, b) => a - b);
  const sleepHours   = calcSleepHours(profile.wake_time, profile.sleep_time);
  const lastMeal     = calcLastMealTime(profile.sleep_time);
  const excluded     = profile.excluded_foods || [];

  // Данные для донат-диаграммы
  const spendCategories = stats?.spend_by_category || [];
  const spendTotal      = stats?.spend_total || 0;
  const budgetWeekly    = Math.round(profile.budget_weekly || 0);
  const budgetLeft      = budgetWeekly > 0 ? budgetWeekly - spendTotal : null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-label="Профиль"
        style={{ maxHeight: "min(92vh, 760px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Шапка */}
        <div className="modal-head">
          <div className="modal-head-text">
            <h2 className="modal-title">Профиль</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        <div className="modal-body">

          {/* ── Блок 1: Личные данные ── */}
          <Section>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
              <div style={{
                width: 48, height: 48, borderRadius: "50%",
                background: "var(--c-accent-light)", color: "var(--c-accent)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, fontSize: 17, flexShrink: 0,
              }}>
                {(profile.name || "?").split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 17 }}>{profile.name || "Без имени"}</div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {profile.age ?? "—"} лет · {profile.weight ?? "—"} кг · {profile.height ?? "—"} см
                </div>
              </div>
            </div>

            {/* Средние КБЖУ */}
            {statsLoading ? (
              <div className="muted" style={{ fontSize: 13 }}>Загрузка статистики…</div>
            ) : stats && stats.days_tracked > 0 ? (
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
                gap: 6, marginTop: 4,
              }}>
                {[
                  { val: stats.avg_kcal,    lbl: "ккал" },
                  { val: `${stats.avg_protein} г`, lbl: "белки" },
                  { val: `${stats.avg_fat} г`,     lbl: "жиры" },
                  { val: `${stats.avg_carbs} г`,   lbl: "углеводы" },
                ].map(({ val, lbl }) => (
                  <div key={lbl} style={{
                    background: "var(--color-background-secondary)",
                    borderRadius: "var(--border-radius-md)",
                    padding: "8px 4px", textAlign: "center",
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>
                      {val}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--color-text-secondary)", marginTop: 2 }}>
                      {lbl}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted" style={{ fontSize: 13 }}>
                КБЖУ появятся после первых записей в дневнике
              </div>
            )}
          </Section>

          {/* ── Блок 2: Цель ── */}
          <Section label="Цель">
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "var(--color-background-success)",
              color: "var(--color-text-success)",
              borderRadius: 999, padding: "5px 12px",
              fontSize: 13, fontWeight: 600,
            }}>
              {GOAL_LABEL[profile.goal] || profile.goal}
            </div>
            {profile.goal_custom && (
              <div className="muted" style={{ fontSize: 13, marginTop: 8, lineHeight: 1.45 }}>
                {profile.goal_custom}
              </div>
            )}
          </Section>

          {/* ── Блок 3: Активность и сон ── */}
          <Section label="Активность и сон">
            {/* Тренировочные дни */}
            <div style={{ display: "flex", gap: 5, marginBottom: 12 }}>
              {WD.map((day, idx) => {
                const isTraining = trainingDays.includes(idx);
                return (
                  <div
                    key={day}
                    style={{
                      width: 34, height: 34, borderRadius: "50%",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 600,
                      border: "0.5px solid var(--color-border-tertiary)",
                      background: isTraining ? "var(--color-background-info)" : "var(--color-background-secondary)",
                      color: isTraining ? "var(--color-text-info)" : "var(--color-text-secondary)",
                    }}
                  >
                    {day}
                  </div>
                );
              })}
            </div>

            {/* Режим сна */}
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { lbl: "Подъём",        val: profile.wake_time || "—" },
                { lbl: "Последний приём", val: lastMeal },
                { lbl: "Отбой",         val: profile.sleep_time || "—" },
                {
                  lbl: "Сон",
                  val: sleepHours ? `${sleepHours} ч` : "—",
                  accent: sleepHours && parseFloat(sleepHours) >= 7,
                },
              ].map(({ lbl, val, accent }) => (
                <div key={lbl} style={{
                  flex: 1,
                  background: "var(--color-background-secondary)",
                  borderRadius: "var(--border-radius-md)",
                  padding: "8px 6px",
                }}>
                  <div style={{ fontSize: 10, color: "var(--color-text-secondary)", marginBottom: 3 }}>
                    {lbl}
                  </div>
                  <div style={{
                    fontSize: 14, fontWeight: 600,
                    color: accent ? "var(--color-text-success)" : "var(--color-text-primary)",
                  }}>
                    {val}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* ── Блок 4: Питание за неделю ── */}
          <Section label="Питание за неделю">
            {statsLoading ? (
              <div className="muted" style={{ fontSize: 13 }}>Загрузка…</div>
            ) : (
              <>
                {/* Донат + легенда */}
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <DonutChart categories={spendCategories} total={spendTotal} />

                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                    {spendCategories.length === 0 ? (
                      <div className="muted" style={{ fontSize: 13 }}>
                        Расходы появятся после первых покупок
                      </div>
                    ) : (
                      <>
                        {spendCategories.slice(0, 4).map((cat, i) => (
                          <div key={cat.key} style={{
                            display: "flex", alignItems: "center", gap: 7,
                            fontSize: 12, color: "var(--color-text-primary)",
                          }}>
                            <span style={{
                              width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                              background: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                            }} />
                            <span style={{ flex: 1 }}>{cat.label}</span>
                            <span style={{ fontWeight: 600, color: "var(--color-text-secondary)" }}>
                              {cat.amount.toLocaleString("ru-RU")} ₽
                            </span>
                          </div>
                        ))}
                        {spendCategories.length > 4 && (
                          <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                            + ещё {spendCategories.length - 4} категории
                          </div>
                        )}
                      </>
                    )}

                    {/* Остаток бюджета */}
                    {budgetLeft !== null && (
                      <div style={{
                        marginTop: 4,
                        paddingTop: 6,
                        borderTop: "0.5px solid var(--color-border-tertiary)",
                        display: "flex", justifyContent: "space-between",
                        fontSize: 11, color: "var(--color-text-secondary)",
                      }}>
                        <span>Бюджет {budgetWeekly.toLocaleString("ru-RU")} ₽</span>
                        <span style={{
                          fontWeight: 600,
                          color: budgetLeft >= 0 ? "var(--color-text-success)" : "var(--color-text-danger)",
                        }}>
                          {budgetLeft >= 0 ? `−${budgetLeft.toLocaleString("ru-RU")} ₽` : `+${Math.abs(budgetLeft).toLocaleString("ru-RU")} ₽`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </Section>

          {/* ── Исключения ── */}
          {excluded.length > 0 && (
            <Section label="Исключения из плана">
              <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--color-text-primary)" }}>
                {excluded.join(", ")}
              </div>
            </Section>
          )}

          {/* ── Кнопка редактирования ── */}
          <button
            type="button"
            className="pill-btn pill-btn-primary"
            style={{ width: "100%", marginTop: 4 }}
            onClick={onEdit}
          >
            Редактировать профиль
          </button>

        </div>
      </div>
    </div>
  );
}