const BUDGETS = [
  { id: "economy", title: "Эконом", desc: "ориентир до 1500 ₽ в неделю" },
  { id: "medium", title: "Средний", desc: "ориентир 1500–3000 ₽ в неделю" },
  { id: "unlimited", title: "Без жёсткого лимита", desc: "для подбора без урезания по цене" },
  { id: "custom", title: "Своя сумма", desc: "укажешь точный лимит в ₽ за неделю" },
];

export default function OnboardingStep3({ value, onChange }) {
  const setBudget = (id) => onChange({ ...value, budget: id });

  return (
    <div className="modal-stack onboarding-step-inner">
      <p className="onboarding-lead">
        Ориентир для генерации списка покупок и блюд. Можно изменить позже в профиле.
      </p>

      <div className="field-group">
        <div className="field-label">Бюджет на неделю</div>
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
          <input
            className="modal-select onboarding-input"
            style={{ marginTop: 10 }}
            inputMode="numeric"
            placeholder="Сумма в ₽ за неделю"
            value={value.budget_custom ?? ""}
            onChange={(e) => onChange({ ...value, budget_custom: e.target.value })}
          />
        )}
      </div>
    </div>
  );
}
