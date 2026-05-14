const ACTIVITY_LEVELS = [
  {
    id: "sedentary",
    title: "Сидячий",
    desc: "Офис, мало движения, без спорта",
  },
  {
    id: "light",
    title: "Лёгкая активность",
    desc: "Прогулки, лёгкие тренировки 1–2 раза в неделю",
  },
  {
    id: "moderate",
    title: "Умеренная",
    desc: "Тренировки 3–5 раз в неделю",
  },
  {
    id: "active",
    title: "Высокая",
    desc: "Ежедневные тренировки или физический труд",
  },
  {
    id: "very_active",
    title: "Очень высокая",
    desc: "Профспорт, тяжёлый физтруд + тренировки",
  },
];

const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export default function OnboardingStep2({ value, onChange }) {
  const setActivity = (id) => onChange({ ...value, activity_level: id });

  const toggleDay = (idx) => {
    const days = value.training_days || [];
    const next = days.includes(idx) ? days.filter((d) => d !== idx) : [...days, idx];
    onChange({ ...value, training_days: next });
  };

  return (
    <div className="modal-stack onboarding-step-inner">
      <div className="field-group">
        <div className="field-label">Уровень активности</div>
        <div className="modal-option-list onboarding-goal-list">
          {ACTIVITY_LEVELS.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`modal-option-card onboarding-goal-card${
                value.activity_level === a.id ? " modal-option-card--accent" : ""
              }`}
              onClick={() => setActivity(a.id)}
            >
              <span className="modal-option-title">{a.title}</span>
              <span className="modal-option-desc">{a.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="field-group">
        <div className="field-label">Дни тренировок <span style={{ fontWeight: 400, color: "var(--c-text-tertiary)" }}>(необязательно)</span></div>
        <div className="onboarding-days-row">
          {DAYS.map((d, i) => {
            const active = (value.training_days || []).includes(i);
            return (
              <button
                key={i}
                type="button"
                className={`onboarding-day-btn${active ? " onboarding-day-btn--active" : ""}`}
                onClick={() => toggleDay(i)}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
