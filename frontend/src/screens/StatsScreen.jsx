import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet } from "../api/client";

const SPEND_COLORS  = ["#4FC3F7","#F5A623","#E05C5C","#63C87A","#9B7FD4","#5BB8C4","#F08080"];
const MACRO_COLORS  = { p: "#63C87A", f: "#F5A623", c: "#4FC3F7" };
const MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];

function mskNow() {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

// ── Пончик с процентами снаружи ───────────────────────────────────────────────
function Donut({ slices, total }) {
  const cx = 120, cy = 120, r = 82, sw = 22, gap = 0.03;
  if (!slices?.length || !total) return (
    <svg width="240" height="240" viewBox="0 0 240 240" aria-hidden>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--c-surface2)" strokeWidth={sw}/>
      <text x={cx} y={cy+5} textAnchor="middle" fontSize="13" fill="var(--c-text-tertiary)" fontFamily="var(--font)">нет данных</text>
    </svg>
  );

  const segs = [];
  let cur = -Math.PI / 2;
  slices.forEach((s, i) => {
    const frac  = s.amount / total;
    const sweep = frac * 2 * Math.PI - gap;
    if (sweep <= 0.01) { cur += frac * 2 * Math.PI; return; }
    const sx = cx + r * Math.cos(cur), sy = cy + r * Math.sin(cur);
    const ex = cx + r * Math.cos(cur + sweep), ey = cy + r * Math.sin(cur + sweep);
    const mid = cur + sweep / 2;
    const lr  = r + sw / 2 + 22;
    segs.push({
      d: `M${sx} ${sy} A${r} ${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${ex} ${ey}`,
      color: s.color || SPEND_COLORS[i % SPEND_COLORS.length],
      lx: cx + lr * Math.cos(mid), ly: cy + lr * Math.sin(mid),
      pct: Math.round(frac * 100), frac,
    });
    cur += frac * 2 * Math.PI;
  });

  return (
    <svg width="240" height="240" viewBox="0 0 240 240" style={{ overflow: "visible" }} aria-hidden>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--c-surface2)" strokeWidth={sw}/>
      {segs.map((s, i) => (
        <g key={i}>
          <path d={s.d} fill="none" stroke={s.color} strokeWidth={sw} strokeLinecap="round"/>
          {s.frac >= 0.05 && (
            <text x={s.lx} y={s.ly} textAnchor="middle" dominantBaseline="middle"
              fontSize="11" fontWeight="600" fill="var(--c-text-secondary)" fontFamily="var(--font)">
              {s.pct}%
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

// ── Плитка категории ──────────────────────────────────────────────────────────
function CatTile({ color, name, value, wide }) {
  return (
    <div className={`st-cat-tile${wide ? " st-cat-tile--wide" : ""}`}>
      <span className="st-cat-dot" style={{ background: color }}/>
      <span className="st-cat-name">{name}</span>
      <span className="st-cat-val">{value}</span>
    </div>
  );
}

// ── Строка блюда ─────────────────────────────────────────────────────────────
const RANK_COLORS = ["#F5A623","#9B7FD4","#4FC3F7","#63C87A","#E05C5C","#5BB8C4","#F08080","#4FC3F7","#63C87A","#9B7FD4"];

function DishRow({ rank, name, count, avgKcal }) {
  return (
    <div className="st-dish-row">
      <span className="st-dish-rank-badge" style={{ background: RANK_COLORS[(rank-1) % RANK_COLORS.length] }}>
        {rank}
      </span>
      <span className="st-dish-name">{name}</span>
      <div className="st-dish-right">
        <span className="st-dish-count">{count}×</span>
        <span className="st-dish-kcal">~{avgKcal} ккал</span>
      </div>
    </div>
  );
}

// ── Основной компонент ────────────────────────────────────────────────────────
export default function StatsScreen({ userId, onClose }) {
  const { year: initY, month: initM } = mskNow();
  const [tab,   setTab]   = useState("money");
  const [year,  setYear]  = useState(initY);
  const [month, setMonth] = useState(initM);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const touchX = useRef(null);

  const load = useCallback(async (y, m) => {
    setLoading(true);
    try {
      setStats(await apiGet("/api/profile/stats", { user_id: userId, year: y, month: m }));
    } catch { setStats(null); }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { load(year, month); }, [year, month, load]);

  const { year: curY, month: curM } = mskNow();
  const isMax = year === curY && month === curM;

  const prevMonth = () => month === 1 ? (setYear(y => y - 1), setMonth(12)) : setMonth(m => m - 1);
  const nextMonth = () => { if (!isMax) { month === 12 ? (setYear(y => y + 1), setMonth(1)) : setMonth(m => m + 1); } };

  const onTouchStart = e => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd   = e => {
    if (!touchX.current) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) < 40) return;
    dx < 0 ? nextMonth() : prevMonth();
  };

  const cats   = stats?.spend_by_category || [];
  const total  = stats?.spend_total || 0;
  const dishes = stats?.top_dishes  || [];

  const pKcal = (stats?.avg_protein || 0) * 4;
  const fKcal = (stats?.avg_fat     || 0) * 9;
  const cKcal = (stats?.avg_carbs   || 0) * 4;
  const macroTotal = pKcal + fKcal + cKcal;
  const macroSlices = [
    { amount: pKcal, color: MACRO_COLORS.p },
    { amount: fKcal, color: MACRO_COLORS.f },
    { amount: cKcal, color: MACRO_COLORS.c },
  ];

  return (
    <div className="st-screen" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>

      {/* Шапка */}
      <div className="st-header">
        <button type="button" className="st-back" onClick={onClose} aria-label="Назад">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M11 14L6 9L11 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className="st-title">Статистика</span>
        <div style={{ width: 34 }}/>
      </div>

      {/* Табы */}
      <div className="st-tabs">
        {[["money","Деньги"],["food","Еда"]].map(([id, lbl]) => (
          <button key={id} type="button"
            className={`st-tab${tab === id ? " st-tab--on" : ""}`}
            onClick={() => setTab(id)}>{lbl}</button>
        ))}
      </div>

      {/* Месяц по центру, без стрелок */}
      <div className="st-month-bar">
        <span className="st-month-name">{MONTHS[month - 1]} {year}</span>
      </div>

      {/* Контент */}
      <div className="st-scroll">
        {loading ? (
          <div className="st-empty"><span style={{ fontSize: 13, color: "var(--c-text-secondary)" }}>Загружаем…</span></div>
        ) : tab === "money" ? (
          total === 0 ? (
            <>
              <div className="st-big">0 ₽</div>
              <div className="st-big-lbl">Траты за месяц</div>
              <div className="st-donut-wrap">
                <button type="button" className="st-donut-arrow" onClick={prevMonth} aria-label="Предыдущий месяц">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                <Donut slices={[]} total={0}/>
                <button type="button" className="st-donut-arrow" onClick={nextMonth} disabled={isMax} aria-label="Следующий месяц">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 12L10 8L6 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="st-big">{total.toLocaleString("ru-RU")} ₽</div>
              <div className="st-big-lbl">Траты за месяц</div>
              <div className="st-donut-wrap">
                <button type="button" className="st-donut-arrow" onClick={prevMonth} aria-label="Предыдущий месяц">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                <Donut slices={cats.map((c, i) => ({ ...c, color: SPEND_COLORS[i % SPEND_COLORS.length] }))} total={total}/>
                <button type="button" className="st-donut-arrow" onClick={nextMonth} disabled={isMax} aria-label="Следующий месяц">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 12L10 8L6 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
              <div className="st-cat-grid">
                {cats.map((c, i) => (
                  <CatTile key={c.key} color={SPEND_COLORS[i % SPEND_COLORS.length]}
                    name={c.label} value={`${c.amount.toLocaleString("ru-RU")} ₽`}
                    wide={cats.length % 2 !== 0 && i === cats.length - 1}/>
                ))}
              </div>
            </>
          )
        ) : (
          stats?.days_tracked > 0 || dishes.length > 0 ? (
            <>
              <div className="st-big">{stats.avg_kcal} ккал</div>
              <div className="st-big-lbl">Среднее в день · {stats.days_tracked} дн.</div>
              <div className="st-donut-wrap">
                <button type="button" className="st-donut-arrow" onClick={prevMonth} aria-label="Предыдущий месяц">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                <Donut slices={macroSlices} total={macroTotal}/>
                <button type="button" className="st-donut-arrow" onClick={nextMonth} disabled={isMax} aria-label="Следующий месяц">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 12L10 8L6 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
              <div className="st-cat-grid">
                <CatTile color={MACRO_COLORS.p} name="Белки"    value={`${stats.avg_protein} г`}/>
                <CatTile color={MACRO_COLORS.f} name="Жиры"     value={`${stats.avg_fat} г`}/>
                <CatTile color={MACRO_COLORS.c} name="Углеводы" value={`${stats.avg_carbs} г`} wide/>
              </div>
              {dishes.length > 0 && (
                <>
                  <div className="st-sec-head">Частые блюда</div>
                  <div className="st-dish-list">
                    {dishes.map((d, i) => (
                      <DishRow key={i} rank={i + 1} name={d.name} count={d.count} avgKcal={d.avg_kcal}/>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <div className="st-big">0 ккал</div>
              <div className="st-big-lbl">Среднее в день</div>
              <div className="st-donut-wrap">
                <button type="button" className="st-donut-arrow" onClick={prevMonth} aria-label="Предыдущий месяц">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                <Donut slices={[]} total={0}/>
                <button type="button" className="st-donut-arrow" onClick={nextMonth} disabled={isMax} aria-label="Следующий месяц">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 12L10 8L6 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
              <div className="st-empty-sub" style={{ textAlign: "center", marginTop: 4 }}>Отмечай приёмы пищи чтобы видеть статистику</div>
            </>
          )
        )}
      </div>
    </div>
  );
}