import { useState } from "react";

export default function PlanMenuModal({ open, anchorDate, busy = false, onClose, onConfirm }) {
  const [pending, setPending] = useState(false);
  const [period, setPeriod] = useState("week");

  if (!open) return null;

  const isBusy = busy || pending;

  const submit = async () => {
    if (isBusy) return;
    const start_from = anchorDate || undefined;
    setPending(true);
    try {
      await onConfirm?.({ period, start_from });
    } finally {
      setPending(false);
      onClose?.();
    }
  };

  const closeIfAllowed = () => {
    if (!isBusy) onClose?.();
  };

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
                  <span className="modal-option-desc">Обновить {anchorDate || "…"}</span>
                </button>
                <button
                  type="button"
                  className={`modal-option-card${period === "from_today" ? " modal-option-card--accent" : ""}`}
                  onClick={() => setPeriod("from_today")}
                >
                  <span className="modal-option-title">С этого дня до конца недели</span>
                  <span className="modal-option-desc">7 дней подряд от выбранной даты</span>
                </button>
                <button
                  type="button"
                  className={`modal-option-card${period === "week" ? " modal-option-card--accent" : ""}`}
                  onClick={() => setPeriod("week")}
                >
                  <span className="modal-option-title">Вся неделя заново</span>
                  <span className="modal-option-desc">7 дней от завтра (МСК), если не указана дата</span>
                </button>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button type="button" className="pill-btn pill-btn-primary modal-stack-submit" onClick={submit}>
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
