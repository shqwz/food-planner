const BUDGETS = [
  { id: "economy",   title: "Эконом",            desc: "до 1 500 ₽ в неделю — простые, доступные блюда" },
  { id: "medium",    title: "Средний",            desc: "1 500–3 000 ₽ — разнообразный рацион" },
  { id: "unlimited", title: "Без жёсткого лимита", desc: "для подбора без урезания по цене" },
  { id: "custom",    title: "Своя сумма",          desc: "укажешь точный лимит в ₽ за неделю" },
];

export default function OnboardingStep6({ value, onChange }) {
  const setBudget = (id) => onChange({ ...value, budget: id });

  return (
    <div className="modal-stack onboarding-step-inner">
      <p className="onboarding-lead">
        Ориентир для генерации списка покупок. Можно изменить позже в профиле.
      </p>

      <div className="modal-option-list onboarding-goal-list">
        {BUDGETS.map((b) => (
          <button
            key={b.id}
            type="button"
            className={`modal-option-card onboarding-goal-card${value.budget === b.id ? " modal-option-card--accent" : ""}`}
            onClick={() => setBudget(b.id)}
          >
            <span className="modal-option-title">{b.title}</span>
            <span className="modal-option-desc">{b.desc}</span>
          </button>
        ))}
      </div>

      {value.budget === "custom" && (
        <div className="field-group" style={{ marginTop: 4 }}>
          <label className="field-label" htmlFor="ob-budget-custom">Сумма в ₽ за неделю</label>
          <input
            id="ob-budget-custom"
            className="modal-select onboarding-input"
            inputMode="numeric"
            placeholder="например, 2000"
            value={value.budget_custom ?? ""}
            onChange={(e) => onChange({ ...value, budget_custom: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}
