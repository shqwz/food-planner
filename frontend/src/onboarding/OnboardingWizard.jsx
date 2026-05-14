import { useEffect, useState } from "react";
import { apiPut } from "../api/client";
import OnboardingStep1 from "./OnboardingStep1";
import OnboardingStep2 from "./OnboardingStep2";
import OnboardingStep3 from "./OnboardingStep3";
import OnboardingStep4 from "./OnboardingStep4";
import OnboardingStep5 from "./OnboardingStep5";
import OnboardingStep6 from "./OnboardingStep6";

const TOTAL = 6;

const STEP_HEADINGS = [
  "О себе",
  "Активность",
  "Цель питания",
  "Режим дня",
  "Ограничения",
  "Бюджет",
];

function emptyOnboardForm() {
  return {
    name: "",
    sex: "male",
    age: "",
    weight: "",
    height: "",
    activity_level: "",
    training_days: [],
    goal: "",
    goal_custom: "",
    wake_time: "08:00",
    sleep_time: "23:00",
    excluded_foods: [],
    budget: "",
    budget_custom: "",
  };
}

function profileToForm(p) {
  if (!p) return emptyOnboardForm();
  return {
    name: p.name || "",
    sex: p.sex || "male",
    age: p.age != null ? String(p.age) : "",
    weight: p.weight != null ? String(p.weight) : "",
    height: p.height != null ? String(p.height) : "",
    activity_level: p.activity_level ?? "",
    training_days: [...(p.training_days || [])],
    goal: p.goal || "",
    goal_custom: p.goal_custom || "",
    wake_time: p.wake_time || "08:00",
    sleep_time: p.sleep_time || "23:00",
    excluded_foods: [...(p.excluded_foods || [])],
    budget: p.budget_tier || "",
    budget_custom: p.budget_custom != null ? String(p.budget_custom) : "",
  };
}

export default function OnboardingWizard({ userId, mode = "onboard", initialProfile, onDone, onCancel }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(() =>
    mode === "edit" && initialProfile?.exists ? profileToForm(initialProfile) : emptyOnboardForm(),
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (mode === "edit" && initialProfile?.exists) {
      queueMicrotask(() => setForm(profileToForm(initialProfile)));
    }
  }, [mode, initialProfile]);

  const buildPayload = (f) => {
    const age = parseInt(String(f.age), 10);
    const weight = parseFloat(String(f.weight).replace(",", "."));
    const height = parseFloat(String(f.height).replace(",", "."));
    return {
      user_id: userId,
      name: (f.name || "").trim() || "Гость",
      sex: f.sex || "male",
      age: Number.isFinite(age) ? age : 25,
      weight: Number.isFinite(weight) ? weight : 75,
      height: Number.isFinite(height) ? height : 175,
      activity_level: f.activity_level || "moderate",
      training_days: f.training_days || [],
      goal: (f.goal || "recomposition").trim() || "recomposition",
      goal_custom: f.goal === "custom" ? (f.goal_custom || "").trim() : "",
      budget: (f.budget || "medium").trim() || "medium",
      budget_custom:
        f.budget === "custom" ? parseFloat(String(f.budget_custom).replace(",", ".")) : undefined,
      wake_time: f.wake_time || "08:00",
      sleep_time: f.sleep_time || "23:00",
      excluded_foods: f.excluded_foods || [],
    };
  };

  const save = async (f) => {
    setSaving(true);
    setErr("");
    try {
      await apiPut("/api/profile", buildPayload(f));
      onDone?.();
    } catch (e) {
      setErr(e.message || "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const validateStep = (s) => {
    setErr("");
    if (s === 1) {
      const age = parseInt(String(form.age), 10);
      const weight = parseFloat(String(form.weight).replace(",", "."));
      const height = parseFloat(String(form.height).replace(",", "."));
      if (!Number.isFinite(age) || age < 10 || age > 120) {
        setErr("Укажи возраст числом (например, 28)."); return false;
      }
      if (!Number.isFinite(weight) || weight < 30 || weight > 250) {
        setErr("Укажи вес в кг (например, 72)."); return false;
      }
      if (!Number.isFinite(height) || height < 120 || height > 230) {
        setErr("Укажи рост в см (например, 175)."); return false;
      }
    }
    if (s === 2) {
      if (!form.activity_level) {
        setErr("Выбери уровень активности."); return false;
      }
    }
    if (s === 3) {
      if (!form.goal) {
        setErr("Выбери цель — один из вариантов выше."); return false;
      }
      if (form.goal === "custom" && !(form.goal_custom || "").trim()) {
        setErr("Кратко опиши свою цель в поле ниже."); return false;
      }
    }
    if (s === 6) {
      if (!form.budget) {
        setErr("Выбери вариант бюджета."); return false;
      }
      if (form.budget === "custom") {
        const v = parseFloat(String(form.budget_custom).replace(",", "."));
        if (!Number.isFinite(v) || v <= 0) {
          setErr("Введи сумму в ₽ за неделю."); return false;
        }
      }
    }
    return true;
  };

  const next = () => {
    if (!validateStep(step)) return;
    setStep((s) => s + 1);
  };

  const back = () => {
    setErr("");
    setStep((s) => s - 1);
  };

  const finish = async () => {
    if (!validateStep(6)) return;
    await save(form);
  };

  const progressPct = (step / TOTAL) * 100;

  return (
    <div className="modal-backdrop onboarding-backdrop">
      <div className="modal-dialog onboarding-dialog">
        <header className="onboarding-header">
          <div className="onboarding-header-row">
            <span className="onboarding-brand">{mode === "edit" ? "Профиль" : "Настройка"}</span>
            {mode === "edit" && onCancel && (
              <button type="button" className="onboarding-icon-close" onClick={onCancel} aria-label="Закрыть">×</button>
            )}
          </div>
          <div className="onboarding-progress-outer" aria-hidden>
            <div className="onboarding-progress-inner" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="onboarding-step-meta">Шаг {step} из {TOTAL}</p>
          <h1 className="onboarding-heading">{STEP_HEADINGS[step - 1]}</h1>
        </header>

        <div className="modal-body onboarding-body">
          {err && <div className="onboarding-error">{err}</div>}
          {step === 1 && <OnboardingStep1 value={form} onChange={setForm} />}
          {step === 2 && <OnboardingStep2 value={form} onChange={setForm} />}
          {step === 3 && <OnboardingStep3 value={form} onChange={setForm} />}
          {step === 4 && <OnboardingStep4 value={form} onChange={setForm} />}
          {step === 5 && <OnboardingStep5 value={form} onChange={setForm} />}
          {step === 6 && <OnboardingStep6 value={form} onChange={setForm} />}
        </div>

        <footer className="onboarding-footer">
          <div className="onboarding-actions">
            {step === 1 ? (
              <>
                <div className="onboarding-cta-half" aria-hidden />
                <button type="button" className="pill-btn pill-btn-primary onboarding-cta-half" onClick={next}>
                  Далее
                </button>
              </>
            ) : step < TOTAL ? (
              <>
                <button type="button" className="pill-btn pill-btn-ghost onboarding-cta-half" onClick={back}>Назад</button>
                <button type="button" className="pill-btn pill-btn-primary onboarding-cta-half" onClick={next}>Далее</button>
              </>
            ) : (
              <>
                <button type="button" className="pill-btn pill-btn-ghost onboarding-cta-half" onClick={back} disabled={saving}>Назад</button>
                <button type="button" className="pill-btn pill-btn-primary onboarding-cta-half" onClick={finish} disabled={saving}>
                  {saving ? "Сохраняем…" : mode === "edit" ? "Сохранить" : "Завершить"}
                </button>
              </>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
