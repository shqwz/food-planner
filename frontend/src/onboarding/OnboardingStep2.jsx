// Цели с описаниями — то, что видит пользователь при выборе
const GOALS = [
  {
    id:    "recomposition",
    title: "Рекомпозиция",
    desc:  "Набор мышц и снижение жира одновременно — без жёстких ограничений",
  },
  {
    id:    "mass_gain",
    title: "Набор массы",
    desc:  "Профицит калорий, акцент на рост — больше углеводов в тренировочные дни",
  },
  {
    id:    "cutting",
    title: "Сушка",
    desc:  "Дефицит калорий при сохранении мышц — минимум простых углеводов",
  },
  {
    id:    "custom",
    title: "Своя цель",
    desc:  "Опишешь цель своими словами — AI составит план именно под неё",
  },
];

export default function OnboardingStep2({ value, onChange }) {
  const setGoal = (id) => onChange({ ...value, goal: id });

  return (
    <div className="modal-stack onboarding-step-inner">
      <p className="onboarding-lead">
        От выбора зависят ориентиры по калориям и БЖУ в плане.
      </p>

      <div className="modal-option-list onboarding-goal-list">
        {GOALS.map((g) => (
          <button
            key={g.id}
            type="button"
            className={`modal-option-card onboarding-goal-card${
              value.goal === g.id ? " modal-option-card--accent" : ""
            }`}
            onClick={() => setGoal(g.id)}
          >
            <span className="modal-option-title">{g.title}</span>
            <span className="modal-option-desc">{g.desc}</span>
          </button>
        ))}
      </div>

      {/* Поле «своя цель» показывается только при выборе custom.
          goal_custom — свободный текст, он передаётся в AI напрямую
          и полностью определяет стратегию питания. */}
      {value.goal === "custom" && (
        <div className="field-group" style={{ marginTop: 12 }}>
          <label className="field-label" htmlFor="ob-gc">
            Опиши свою цель
          </label>
          <textarea
            id="ob-gc"
            className="modal-textarea onboarding-textarea-sm"
            value={value.goal_custom || ""}
            onChange={(e) => onChange({ ...value, goal_custom: e.target.value })}
            placeholder="Например: поддержание веса при смене режима работы, питание для марафонца, снизить вес к отпуску за 2 месяца"
            rows={3}
          />
        </div>
      )}
    </div>
  );
}