const BUDGETS = [
  {
    id: "economy",
    title: "до 3 000 ₽",
    label: "Эконом",
    desc: "Простые и доступные блюда, базовые продукты",
    weekly: 3000,
  },
  {
    id: "medium",
    title: "до 6 000 ₽",
    label: "Средний",
    desc: "Разнообразный рацион, мясо, рыба, свежие овощи",
    weekly: 6000,
  },
  {
    id: "unlimited",
    title: "Без лимита",
    label: "Комфорт",
    desc: "Подбор без урезания по цене — приоритет качеству",
    weekly: null,
  },
  {
    id: "custom",
    title: "Своя сумма",
    label: "Свой",
    desc: "Укажи точный лимит в ₽ за неделю",
    weekly: null,
  },
];

export default function OnboardingStep6({ value, onChange }) {
  const setBudget = (id) => {
    const preset = BUDGETS.find((b) => b.id === id);
    onChange({
      ...value,
      budget: id,
      budget_custom: preset?.weekly ? String(preset.weekly) : value.budget_custom,
    });
  };

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
            className={`modal-option-card onboarding-goal-card onboarding-budget-card${value.budget === b.id ? " modal-option-card--accent" : ""}`}
            onClick={() => setBudget(b.id)}
          >
            <div className="onboarding-budget-row">
              <span className="modal-option-title">{b.title}</span>
              <span className="onboarding-budget-label">{b.label}</span>
            </div>
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
            placeholder="например, 4500"
            value={value.budget_custom ?? ""}
            onChange={(e) => onChange({ ...value, budget_custom: e.target.value })}
            autoFocus
          />
        </div>
      )}
    </div>
  );
}