const PRESET_EXCLUSIONS = [
  { id: "gluten",  label: "Глютен" },
  { id: "lactose", label: "Лактоза" },
  { id: "nuts",    label: "Орехи" },
  { id: "pork",    label: "Свинина" },
  { id: "beef",    label: "Говядина" },
  { id: "fish",    label: "Рыба" },
  { id: "seafood", label: "Морепродукты" },
  { id: "eggs",    label: "Яйца" },
  { id: "alcohol", label: "Алкоголь" },
  { id: "sugar",   label: "Сахар" },
  { id: "mushrooms", label: "Грибы" },
  { id: "spicy",   label: "Острое" },
];

import { useState } from "react";

export default function OnboardingStep5({ value, onChange }) {
  const [input, setInput] = useState("");
  const excluded = value.excluded_foods || [];

  const toggle = (label) => {
    const next = excluded.includes(label)
      ? excluded.filter((x) => x !== label)
      : [...excluded, label];
    onChange({ ...value, excluded_foods: next });
  };

  const addCustom = () => {
    const t = input.trim();
    if (!t || excluded.includes(t)) { setInput(""); return; }
    onChange({ ...value, excluded_foods: [...excluded, t] });
    setInput("");
  };

  const remove = (label) => {
    onChange({ ...value, excluded_foods: excluded.filter((x) => x !== label) });
  };

  return (
    <div className="modal-stack onboarding-step-inner">
      <p className="onboarding-lead">
        Аллергены, непереносимость, религиозные ограничения — всё это не попадёт в план.
      </p>

      <div className="field-group">
        <div className="field-label">Частые ограничения</div>
        <div className="onboarding-preset-chips">
          {PRESET_EXCLUSIONS.map((p) => {
            const active = excluded.includes(p.label);
            return (
              <button
                key={p.id}
                type="button"
                className={`onboarding-preset-chip${active ? " onboarding-preset-chip--active" : ""}`}
                onClick={() => toggle(p.label)}
              >
                {active && <span className="onboarding-preset-chip-check" aria-hidden>✓ </span>}
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="field-group">
        <label className="field-label" htmlFor="ob-excl-custom">Добавить своё</label>
        <div className="onboarding-excl-input-row">
          <input
            id="ob-excl-custom"
            className="modal-select onboarding-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
            placeholder="Название продукта или блюда"
            autoComplete="off"
          />
          <button
            type="button"
            className="onboarding-excl-add-btn"
            onClick={addCustom}
            disabled={!input.trim()}
          >
            Добавить
          </button>
        </div>
      </div>

      {excluded.length > 0 && (
        <div className="field-group">
          <div className="field-label">В списке исключений</div>
          <div className="onboarding-chip-wrap">
            {excluded.map((x) => (
              <span key={x} className="onboarding-chip">
                {x}
                <button
                  type="button"
                  className="onboarding-chip-remove"
                  aria-label={`Удалить ${x}`}
                  onClick={() => remove(x)}
                >×</button>
              </span>
            ))}
          </div>
        </div>
      )}

      {excluded.length === 0 && (
        <p className="onboarding-field-hint" style={{ textAlign: "center" }}>
          Можно пропустить — если нет ограничений
        </p>
      )}
    </div>
  );
}
