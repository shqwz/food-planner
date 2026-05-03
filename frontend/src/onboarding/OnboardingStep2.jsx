const GOALS = [
  { id: "recomposition", title: "Рекомпозиция", desc: "Мышцы и снижение жира без жёсткой сушки" },
  { id: "mass_gain", title: "Набор массы", desc: "Больше калорий и акцент на рост" },
  { id: "cutting", title: "Сушка", desc: "Дефицит калорий, сохранение мышц" },
  { id: "custom", title: "Своя формулировка", desc: "Опишешь цель своими словами" },
];

export default function OnboardingStep2({ value, onChange }) {
  const setGoal = (id) => onChange({ ...value, goal: id });

  return (
    <div className="modal-stack onboarding-step-inner">
      <p className="onboarding-lead">Выбери один вариант — от этого зависят ориентиры по калориям и БЖУ в плане.</p>

      <div className="modal-option-list onboarding-goal-list">
        {GOALS.map((g) => (
          <button
            key={g.id}
            type="button"
            className={`modal-option-card onboarding-goal-card${value.goal === g.id ? " modal-option-card--accent" : ""}`}
            onClick={() => setGoal(g.id)}
          >
            <span className="modal-option-title">{g.title}</span>
            <span className="modal-option-desc">{g.desc}</span>
          </button>
        ))}
      </div>

      {value.goal === "custom" && (
        <div className="field-group">
          <label className="field-label" htmlFor="ob-gc">
            Опиши цель
          </label>
          <textarea
            id="ob-gc"
            className="modal-textarea onboarding-textarea-sm"
            value={value.goal_custom || ""}
            onChange={(e) => onChange({ ...value, goal_custom: e.target.value })}
            placeholder="Например: поддержание веса при смене графика работы"
          />
        </div>
      )}
    </div>
  );
}
