const GOALS = [
  {
    id: "recomposition",
    title: "Рекомпозиция",
    desc: "Набор мышц и снижение жира одновременно — без жёстких ограничений",
  },
  {
    id: "mass_gain",
    title: "Набор массы",
    desc: "Профицит калорий, акцент на рост — больше углеводов в тренировочные дни",
  },
  {
    id: "cutting",
    title: "Сушка",
    desc: "Дефицит калорий при сохранении мышц — минимум простых углеводов",
  },
  {
    id: "custom",
    title: "Своя цель",
    desc: "Опишешь цель своими словами — AI составит план именно под неё",
  },
];

const ACTIVITY_COEF = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

function calcKcal(value, goal) {
  const w = parseFloat(String(value.weight).replace(",", "."));
  const h = parseFloat(String(value.height).replace(",", "."));
  const a = parseInt(String(value.age), 10);
  const sex = value.sex || "male";
  const activity = value.activity_level || "moderate";
  if (!w || !h || !a) return null;
  const bmr =
    sex === "female"
      ? 10 * w + 6.25 * h - 5 * a - 161
      : 10 * w + 6.25 * h - 5 * a + 5;
  const coef = ACTIVITY_COEF[activity] || 1.55;
  const tdee = bmr * coef;
  if (goal === "mass_gain") return Math.round(tdee + 300);
  if (goal === "cutting") return Math.round(tdee - 400);
  return Math.round(tdee);
}

function calcMacros(kcal, weight, goal) {
  if (!kcal || !weight) return null;
  const w = parseFloat(String(weight).replace(",", "."));
  const protein = Math.round(w * (goal === "cutting" ? 2.2 : 2.0));
  const fat = Math.round((kcal * 0.25) / 9);
  const carbs = Math.round((kcal - protein * 4 - fat * 9) / 4);
  return { protein, fat, carbs };
}

export default function OnboardingStep3({ value, onChange }) {
  const setGoal = (id) => onChange({ ...value, goal: id });
  const selectedGoal = value.goal || "";
  const kcal = selectedGoal && selectedGoal !== "custom" ? calcKcal(value, selectedGoal) : null;
  const macros = kcal ? calcMacros(kcal, value.weight, selectedGoal) : null;

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

      {kcal && macros && (
        <div className="onboarding-kcal-preview">
          <div className="onboarding-kcal-label">Ваш ориентир на день</div>
          <div className="onboarding-kcal-row">
            <span className="onboarding-kcal-main">{kcal} ккал</span>
          </div>
          <div className="onboarding-macros-row">
            <span className="onboarding-macro onboarding-macro--p">Б {macros.protein}г</span>
            <span className="onboarding-macro onboarding-macro--f">Ж {macros.fat}г</span>
            <span className="onboarding-macro onboarding-macro--c">У {macros.carbs}г</span>
          </div>
        </div>
      )}

      {value.goal === "custom" && (
        <div className="field-group" style={{ marginTop: 4 }}>
          <label className="field-label" htmlFor="ob-gc">Опиши свою цель</label>
          <textarea
            id="ob-gc"
            className="modal-textarea onboarding-textarea-sm"
            value={value.goal_custom || ""}
            onChange={(e) => onChange({ ...value, goal_custom: e.target.value })}
            placeholder="Например: поддержание веса при смене режима, питание для марафонца, снизить вес к отпуску"
            rows={3}
          />
        </div>
      )}
    </div>
  );
}
