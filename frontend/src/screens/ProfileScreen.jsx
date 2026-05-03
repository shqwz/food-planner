const GOAL_LABEL = {
  recomposition: "Рекомпозиция",
  mass_gain: "Набор массы",
  cutting: "Сушка",
  custom: "Своя цель",
};

const BUDGET_LABEL = {
  economy: "Эконом (до 1500 ₽)",
  medium: "Средний (1500–3000 ₽)",
  unlimited: "Неограничен",
  custom: "Своя сумма",
};

const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export default function ProfileScreen({ profile, onClose, onEdit }) {
  if (!profile?.exists) return null;

  const td = (profile.training_days || []).slice().sort((a, b) => a - b);
  const exc = profile.excluded_foods || [];

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-dialog"
        role="dialog"
        style={{ maxHeight: "min(92vh, 720px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div className="modal-head-text">
            <h2 className="modal-title">Профиль</h2>
            <p className="modal-subtitle">Твои настройки питания</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="card" style={{ padding: 16, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  background: "var(--c-accent-light)",
                  color: "var(--c-accent)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: 18,
                }}
              >
                {(profile.name || "?")
                  .split(/\s+/)
                  .map((s) => s[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{profile.name || "Без имени"}</div>
                <div className="muted" style={{ fontSize: 13 }}>
                  Данные для плана и дневника
                </div>
              </div>
            </div>
          </div>

          <div className="section-title">Данные</div>
          <div className="card" style={{ padding: 14, marginBottom: 12 }}>
            <div className="kpi">Возраст · Вес · Рост</div>
            <div style={{ fontWeight: 700, marginTop: 4 }}>
              {profile.age ?? "—"} лет · {profile.weight ?? "—"} кг · {profile.height ?? "—"} см
            </div>
          </div>

          <div className="section-title">Цель</div>
          <div className="card" style={{ padding: 14, marginBottom: 12 }}>
            <div style={{ fontWeight: 700 }}>{GOAL_LABEL[profile.goal] || profile.goal}</div>
            {profile.goal === "custom" && profile.goal_custom && (
              <div className="muted" style={{ marginTop: 6, fontSize: 14 }}>
                {profile.goal_custom}
              </div>
            )}
          </div>

          <div className="section-title">Активность</div>
          <div className="card" style={{ padding: 14, marginBottom: 12 }}>
            <div className="kpi">Дни тренировок</div>
            <div style={{ fontWeight: 600, marginTop: 4 }}>
              {td.length ? td.map((d) => WD[d] || d).join(", ") : "Не задано"}
            </div>
            <div className="kpi" style={{ marginTop: 10 }}>
              Подъём · Отбой
            </div>
            <div style={{ fontWeight: 600, marginTop: 4 }}>
              {profile.wake_time || "—"} · {profile.sleep_time || "—"}
            </div>
          </div>

          <div className="section-title">Бюджет</div>
          <div className="card" style={{ padding: 14, marginBottom: 12 }}>
            <div style={{ fontWeight: 700 }}>
              {BUDGET_LABEL[profile.budget_tier] || "—"}
            </div>
            <div className="muted" style={{ marginTop: 6 }}>
              Лимит: ~{Math.round(profile.budget_weekly || 0).toLocaleString("ru-RU")} ₽ / нед
            </div>
          </div>

          <div className="section-title">Исключения из плана</div>
          <div className="card" style={{ padding: 14, marginBottom: 12 }}>
            <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
              Продукты и блюда, которые не должны попадать в автогенерацию.
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.45 }}>{exc.length ? exc.join(", ") : "Не задано"}</div>
          </div>

          <button type="button" className="pill-btn pill-btn-primary" style={{ width: "100%" }} onClick={onEdit}>
            Редактировать профиль
          </button>
        </div>
      </div>
    </div>
  );
}
