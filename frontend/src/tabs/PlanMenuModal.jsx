import { useEffect, useMemo, useState } from "react";

function toIsoFromLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function calendarMatrix(viewYear, viewMonth) {
  const first = new Date(viewYear, viewMonth, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const start = new Date(viewYear, viewMonth, 1 - startOffset);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({
      iso: toIsoFromLocalDate(d),
      inMonth: d.getMonth() === viewMonth,
      dayNum: d.getDate(),
    });
  }
  return cells;
}

function monthLabelRu(viewYear, viewMonth) {
  const raw = new Date(viewYear, viewMonth, 15).toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric",
  });
  return raw.replace(/^./, (c) => c.toUpperCase());
}

function PlanMiniCalendar({
  viewYear,
  viewMonth,
  selectedIso,
  todayIso,
  onPick,
  onPrevMonth,
  onNextMonth,
}) {
  const cells = useMemo(() => calendarMatrix(viewYear, viewMonth), [viewYear, viewMonth]);
  const wdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

  return (
    <div className="plan-mini-cal" role="group" aria-label="Календарь, выбор даты начала">
      <div className="plan-mini-cal__toolbar">
        <button
          type="button"
          className="plan-mini-cal__nav"
          onClick={onPrevMonth}
          aria-label="Предыдущий месяц"
        >
          ‹
        </button>
        <div className="plan-mini-cal__title">{monthLabelRu(viewYear, viewMonth)}</div>
        <button
          type="button"
          className="plan-mini-cal__nav"
          onClick={onNextMonth}
          aria-label="Следующий месяц"
        >
          ›
        </button>
      </div>
      <div className="plan-mini-cal__weekdays" aria-hidden>
        {wdays.map((w) => (
          <span key={w} className="plan-mini-cal__wd">
            {w}
          </span>
        ))}
      </div>
      <div className="plan-mini-cal__grid">
        {cells.map((cell) => {
          const isSel = cell.iso === selectedIso;
          const isToday = todayIso && cell.iso === todayIso;
          return (
            <button
              key={cell.iso}
              type="button"
              className={`plan-mini-cal__cell${cell.inMonth ? "" : " plan-mini-cal__cell--mute"}${
                isSel ? " plan-mini-cal__cell--selected" : ""
              }${isToday && !isSel ? " plan-mini-cal__cell--today" : ""}`}
              onClick={() => onPick(cell.iso)}
              aria-pressed={isSel}
              aria-current={isToday ? "date" : undefined}
            >
              <span className="plan-mini-cal__cell-num">{cell.dayNum}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** UI: day | from_today | from_custom — на сабмите from_custom → API period from_today + start_from */
export default function PlanMenuModal({ open, anchorDate, todayIso, busy = false, onClose, onConfirm }) {
  const [pending, setPending] = useState(false);
  const [period, setPeriod] = useState("from_today");
  const [customStartIso, setCustomStartIso] = useState("");
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());

  useEffect(() => {
    if (!open) return;
    const base = anchorDate || todayIso || "";
    setCustomStartIso(base);
    if (base) {
      const d = new Date(`${base}T12:00:00`);
      setCalYear(d.getFullYear());
      setCalMonth(d.getMonth());
    }
  }, [open, anchorDate, todayIso]);

  if (!open) return null;

  const isBusy = busy || pending;

  const submit = async () => {
    if (isBusy) return;
    let start_from;
    let apiPeriod;
    if (period === "day") {
      apiPeriod = "day";
      start_from = anchorDate || undefined;
    } else if (period === "from_today") {
      apiPeriod = "from_today";
      start_from = todayIso || undefined;
    } else {
      apiPeriod = "from_today";
      start_from = customStartIso || undefined;
    }
    setPending(true);
    try {
      await onConfirm?.({ period: apiPeriod, start_from });
    } finally {
      setPending(false);
      onClose?.();
    }
  };

  const closeIfAllowed = () => {
    if (!isBusy) onClose?.();
  };

  const goPrevMonth = () => {
    if (calMonth === 0) {
      setCalYear((y) => y - 1);
      setCalMonth(11);
    } else {
      setCalMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (calMonth === 11) {
      setCalYear((y) => y + 1);
      setCalMonth(0);
    } else {
      setCalMonth((m) => m + 1);
    }
  };

  const customSubtitle = customStartIso
    ? new Date(`${customStartIso}T12:00:00`).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
      })
    : "—";

  return (
    <div className="modal-backdrop" role="presentation" onClick={closeIfAllowed}>
      <div className="modal-dialog" role="dialog" aria-busy={isBusy || undefined} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-head-text">
            {isBusy ? (
              <>
                <h2 className="modal-title">Генерируем план</h2>
                <p className="modal-subtitle">Подождите, нейросеть обновляет расписание…</p>
              </>
            ) : (
              <>
                <h2 className="modal-title">Управление планом</h2>
                <p className="modal-subtitle">Выбери период перегенерации (нейросеть).</p>
              </>
            )}
          </div>
          <button type="button" className="modal-close" onClick={closeIfAllowed} disabled={isBusy} aria-label="Закрыть">
            ×
          </button>
        </div>
        <div className="modal-body">
          {isBusy ? (
            <div className="plan-generate-state" aria-live="polite">
              <div className="plan-generate-spinner" aria-hidden />
            </div>
          ) : (
            <>
              <div className="modal-option-list">
                <button
                  type="button"
                  className={`modal-option-card${period === "day" ? " modal-option-card--accent" : ""}`}
                  onClick={() => setPeriod("day")}
                >
                  <span className="modal-option-title">Только этот день</span>
                  <span className="modal-option-desc">Выбранная дата в ленте: {anchorDate || "…"}</span>
                </button>
                <button
                  type="button"
                  className={`modal-option-card${period === "from_today" ? " modal-option-card--accent" : ""}`}
                  onClick={() => setPeriod("from_today")}
                >
                  <span className="modal-option-title">7 дней с сегодняшнего</span>
                  <span className="modal-option-desc">Первая дата — сегодня (МСК), далее 6 дней подряд</span>
                </button>
                <button
                  type="button"
                  className={`modal-option-card${period === "from_custom" ? " modal-option-card--accent" : ""}`}
                  onClick={() => setPeriod("from_custom")}
                >
                  <span className="modal-option-title">7 дней с указанного дня</span>
                  <span className="modal-option-desc">
                    {period === "from_custom"
                      ? `С ${customSubtitle} — 7 дней подряд`
                      : "Укажи дату первого дня в календаре"}
                  </span>
                </button>
              </div>

              {period === "from_custom" && (
                <div className="plan-mini-cal-wrap">
                  <div className="field-label field-label--readable plan-mini-cal-label">С какого дня</div>
                  <PlanMiniCalendar
                    viewYear={calYear}
                    viewMonth={calMonth}
                    selectedIso={customStartIso}
                    todayIso={todayIso}
                    onPick={(iso) => setCustomStartIso(iso)}
                    onPrevMonth={goPrevMonth}
                    onNextMonth={goNextMonth}
                  />
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button
                  type="button"
                  className="pill-btn pill-btn-primary modal-stack-submit"
                  onClick={submit}
                  disabled={period === "from_custom" && !customStartIso}
                >
                  Обновить
                </button>
                <button type="button" className="pill-btn pill-btn-ghost modal-stack-secondary" onClick={closeIfAllowed}>
                  Отмена
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
