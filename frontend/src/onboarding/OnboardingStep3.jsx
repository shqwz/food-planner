const BUDGETS = [
  { id: "economy", title: "До 3 000 ₽", desc: "недельный ориентир для списка и блюд" },
  { id: "medium", title: "До 6 000 ₽", desc: "комфортнее по ассортименту и порциям" },
  { id: "unlimited", title: "Без лимита", desc: "без жёсткого потолка — цены всё равно считаем по-честному" },
  { id: "custom", title: "Своя сумма", desc: "точный лимит в ₽ за неделю" },
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
