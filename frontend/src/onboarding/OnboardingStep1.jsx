export default function OnboardingStep1({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });

  return (
    <div className="modal-stack onboarding-step-inner">
      <p className="onboarding-lead">Имя и антропометрия — для расчёта калорий и плана.</p>

      <div className="field-group">
        <label className="field-label" htmlFor="ob-name">
          Имя
        </label>
        <input
          id="ob-name"
          className="modal-select onboarding-input"
          value={value.name || ""}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Как к тебе обращаться"
          autoComplete="name"
        />
      </div>
      <div className="field-group">
        <label className="field-label" htmlFor="ob-age">
          Возраст
        </label>
        <input
          id="ob-age"
          className="modal-select onboarding-input"
          inputMode="numeric"
          value={value.age ?? ""}
          onChange={(e) => set("age", e.target.value)}
          placeholder="полных лет"
        />
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div className="field-group" style={{ flex: 1 }}>
          <label className="field-label" htmlFor="ob-w">
            Вес, кг
          </label>
          <input
            id="ob-w"
            className="modal-select onboarding-input"
            inputMode="decimal"
            value={value.weight ?? ""}
            onChange={(e) => set("weight", e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="field-group" style={{ flex: 1 }}>
          <label className="field-label" htmlFor="ob-h">
            Рост, см
          </label>
          <input
            id="ob-h"
            className="modal-select onboarding-input"
            inputMode="numeric"
            value={value.height ?? ""}
            onChange={(e) => set("height", e.target.value)}
            placeholder="0"
          />
        </div>
      </div>
    </div>
  );
}
