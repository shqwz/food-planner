import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet } from "../api/client";

// ─── константы ────────────────────────────────────────────────────────────────

const CATEGORY_COLORS = [
  "#4A9EDB","#63C87A","#F5A623","#E05C5C","#9B7FD4","#5BB8C4","#A0A0A0",
];

const MONTHS = [
  "Январь","Февраль","Март","Апрель","Май","Июнь",
  "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь",
];

// ─── утилиты ──────────────────────────────────────────────────────────────────

function describeArc(cx, cy, r, startAngle, endAngle) {
  const s = { x: cx + r * Math.cos(startAngle), y: cy + r * Math.sin(startAngle) };
  const e = { x: cx + r * Math.cos(endAngle),   y: cy + r * Math.sin(endAngle)   };
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${endAngle - startAngle > Math.PI ? 1 : 0} 1 ${e.x} ${e.y}`;
}

function mskNow() {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

// ─── компоненты ───────────────────────────────────────────────────────────────

function DonutChart({ categories, total, label }) {
  const cx = 60, cy = 60, r = 42, sw = 15, gap = 0.04;
  if (!categories?.length || total === 0) {
    return (
      <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--c-surface2)" strokeWidth={sw} />
        <text x={cx} y={cy + 5} textAnchor="middle" fontSize="12"
          fill="var(--c-text-tertiary)" fontFamily="var(--font)">нет данных</text>
      </svg>
    );
  }
  const segments = [];
  let cur = -Math.PI / 2;
  categories.forEach((cat, i) => {
    const sweep = (cat.amount / total) * 2 * Math.PI - gap;
    if (sweep <= 0) return;
    segments.push({ path: describeArc(cx, cy, r, cur, cur + sweep), color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] });
    cur += (cat.amount / total) * 2 * Math.PI;
  });
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--c-surface2)" strokeWidth={sw} />
      {segments.map((s, i) => (
        <path key={i} d={s.path} fill="none" stroke={s.color} strokeWidth={sw} strokeLinecap="round" />
      ))}
      <text x={cx} y={cy - 7} textAnchor="middle" fontSize="15" fontWeight="700"
        fill="var(--c-text-primary)" fontFamily="var(--font)">
        {total.toLocaleString("ru-RU")}
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize="11"
        fill="var(--c-text-secondary)" fontFamily="var(--font)">{label}</text>
    </svg>
  );
}

function MonthNav({ year, month, onChange }) {
  const { year: curY, month: curM } = mskNow();
  const isMax = year === curY && month === curM;

  const prev = () => {
    if (month === 1) onChange(year - 1, 12);
    else onChange(year, month - 1);
  };
  const next = () => {
    if (isMax) return;
    if (month === 12) onChange(year + 1, 1);
    else onChange(year, month + 1);
  };

  return (
    <div className="stats-month-nav">
      <button type="button" className="stats-month-arrow" onClick={prev} aria-label="Предыдущий месяц">‹</button>
      <span className="stats-month-label">{MONTHS[month - 1]} {year}</span>
      <button type="button" className="stats-month-arrow" onClick={next} disabled={isMax} aria-label="Следующий месяц">›</button>
    </div>
  );
}

// ─── основной компонент ───────────────────────────────────────────────────────

export default function StatsScreen({ userId }) {
  const { year: initY, month: initM } = mskNow();
  const [activeTab, setActiveTab] = useState("money"); // "money" | "food"
  const [year, setYear]   = useState(initY);
  const [month, setMonth] = useState(initM);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // свайп
  const touchStart = useRef(null);

  const load = useCallback(async (y, m) => {
    setLoading(true);
    setError("");
    try {
      const data = await apiGet("/api/profile/stats", { user_id: userId, year: y, month: m });
      setStats(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(year, month); }, [year, month, load]);

  const changeMonth = (y, m) => { setYear(y); setMonth(m); };

  const onTouchStart = (e) => { touchStart.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchStart.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStart.current;
    touchStart.current = null;
    if (Math.abs(dx) < 40) return;
    const { year: curY, month: curM } = mskNow();
    if (dx < 0) {
      // свайп влево → следующий месяц
      if (year === curY && month === curM) return;
      if (month === 12) changeMonth(year + 1, 1);
      else changeMonth(year, month + 1);
    } else {
      // свайп вправо → предыдущий месяц
      if (month === 1) changeMonth(year - 1, 12);
      else changeMonth(year, month - 1);
    }
  };

  const spendCategories = stats?.spend_by_category || [];
  const spendTotal = stats?.spend_total || 0;
  const topDishes  = stats?.top_dishes || [];

  return (
    <div className="stats-screen">
      <div className="stock-segment" role="tablist" aria-label="Статистика">
        {[{ id: "money", label: "Деньги" }, { id: "food", label: "Еда" }].map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            className={`stock-tab${activeTab === t.id ? " stock-tab--active" : ""}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Навигация по месяцу */}
      <MonthNav year={year} month={month} onChange={changeMonth} />

      {/* Контент со свайпом */}
      <div
        className="stats-content"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {loading ? (
          <div className="stats-loading">Загружаем…</div>
        ) : error ? (
          <div className="stats-error">{error}</div>
        ) : activeTab === "money" ? (
          <MoneyTab stats={stats} spendCategories={spendCategories} spendTotal={spendTotal} />
        ) : (
          <FoodTab stats={stats} topDishes={topDishes} />
        )}
      </div>
    </div>
  );
}

// ─── вкладка Деньги ──────────────────────────────────────────────────────────

function MoneyTab({ stats, spendCategories, spendTotal }) {
  if (!stats || (spendTotal === 0 && spendCategories.length === 0)) {
    return (
      <div className="stats-empty">
        <div className="stats-empty-icon">💳</div>
        <div className="stats-empty-title">Нет данных о расходах</div>
        <div className="stats-empty-sub">Заверши поход в магазин чтобы увидеть траты</div>
      </div>
    );
  }

  return (
    <div className="stats-section-list">
      <div className="stats-card">
        <div className="stats-card-label">Итого за месяц</div>
        <div className="stats-big-num">{spendTotal.toLocaleString("ru-RU")} ₽</div>
      </div>

      <div className="stats-card">
        <div className="stats-card-label">По категориям</div>
        <div className="stats-donut-row">
          <DonutChart categories={spendCategories} total={spendTotal} label="₽ / мес" />
          <div className="stats-donut-legend">
            {spendCategories.map((cat, i) => (
              <div key={cat.key} className="stats-legend-item">
                <span className="stats-legend-dot" style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                <span className="stats-legend-name">{cat.label}</span>
                <span className="stats-legend-val">{cat.amount.toLocaleString("ru-RU")} ₽</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── вкладка Еда ─────────────────────────────────────────────────────────────

function FoodTab({ stats, topDishes }) {
  const hasKbzhu = stats && stats.days_tracked > 0;
  const hasTop   = topDishes.length > 0;

  if (!hasKbzhu && !hasTop) {
    return (
      <div className="stats-empty">
        <div className="stats-empty-icon">🥗</div>
        <div className="stats-empty-title">Нет записей за этот месяц</div>
        <div className="stats-empty-sub">Отмечай приёмы пищи чтобы видеть статистику</div>
      </div>
    );
  }

  return (
    <div className="stats-section-list">
      {/* Средние КБЖУ */}
      {hasKbzhu && (
        <div className="stats-card">
          <div className="stats-card-label">Среднее за день · {stats.days_tracked} {stats.days_tracked === 1 ? "день" : "дней"}</div>
          <div className="stats-kbzhu-grid">
            {[
              { val: stats.avg_kcal,         lbl: "ккал",    color: "var(--c-accent)"  },
              { val: `${stats.avg_protein} г`, lbl: "белки",  color: "#3a9e6c" },
              { val: `${stats.avg_fat} г`,     lbl: "жиры",   color: "#b07a10" },
              { val: `${stats.avg_carbs} г`,   lbl: "углеводы", color: "#3a6ec0" },
            ].map(({ val, lbl, color }) => (
              <div key={lbl} className="stats-kbzhu-cell">
                <div className="stats-kbzhu-val" style={{ color }}>{val}</div>
                <div className="stats-kbzhu-lbl">{lbl}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Топ блюд */}
      {hasTop && (
        <div className="stats-card">
          <div className="stats-card-label">Самые частые блюда</div>
          <div className="stats-top-dishes">
            {topDishes.map((dish, i) => (
              <div key={i} className="stats-dish-row">
                <span className="stats-dish-rank">#{i + 1}</span>
                <span className="stats-dish-name">{dish.name}</span>
                <div className="stats-dish-right">
                  <span className="stats-dish-count">{dish.count}×</span>
                  <span className="stats-dish-kcal">~{dish.avg_kcal} ккал</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
