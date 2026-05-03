import { useEffect, useState } from "react";
import { apiPut } from "../api/client";
import OnboardingStep1 from "./OnboardingStep1";
import OnboardingStep2 from "./OnboardingStep2";
import OnboardingStep3 from "./OnboardingStep3";
import OnboardingStep4 from "./OnboardingStep4";

const TOTAL = 4;

const STEP_HEADINGS = ["О себе", "Цель питания", "Бюджет на неделю", "Исключения из рациона"];

function emptyOnboardForm() {
  return {
    name: "",
    age: "",
    weight: "",
    height: "",
    goal: "",
    goal_custom: "",
    budget: "",
    budget_custom: "",
    excluded_foods: [],
    wake_time: "08:00",
    sleep_time: "23:00",
    training_days: [],
  };
}

function profileToForm(p) {
  if (!p) return emptyOnboardForm();
  return {
    name: p.name || "",
    age: p.age != null ? String(p.age) : "",
    weight: p.weight != null ? String(p.weight) : "",
    height: p.height != null ? String(p.height) : "",
    goal: p.goal || "",
    goal_custom: p.goal_custom || "",
    budget: p.budget_tier || "",
    budget_custom: p.budget_custom != null ? String(p.budget_custom) : "",
    excluded_foods: [...(p.excluded_foods || [])],
    wake_time: p.wake_time || "08:00",
    sleep_time: p.sleep_time || "23:00",
    training_days: [...(p.training_days || [])],
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
    const body = {
      user_id: userId,
      name: (f.name || "").trim() || "Гость",
      age: Number.isFinite(age) ? age : 25,
      weight: Number.isFinite(weight) ? weight : 75,
      height: Number.isFinite(height) ? height : 175,
      goal: (f.goal || "recomposition").trim() || "recomposition",
      goal_custom: f.goal === "custom" ? (f.goal_custom || "").trim() : "",
      budget: (f.budget || "medium").trim() || "medium",
      budget_custom:
        f.budget === "custom" ? parseFloat(String(f.budget_custom).replace(",", ".")) : undefined,
      wake_time: f.wake_time || "08:00",
      sleep_time: f.sleep_time || "23:00",
      training_days: f.training_days || [],
      excluded_foods: f.excluded_foods || [],
    };
    if (f.goal !== "custom") {
      body.goal_custom = "";
    }
    return body;
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

  const validateStep1 = () => {
    const age = parseInt(String(form.age), 10);
    const weight = parseFloat(String(form.weight).replace(",", "."));
    const height = parseFloat(String(form.height).replace(",", "."));
    if (!Number.isFinite(age) || age < 10 || age > 120) {
      setErr("Укажи возраст числом (например, 28).");
      return false;
    }
    if (!Number.isFinite(weight) || weight < 30 || weight > 250) {
      setErr("Укажи вес в кг (например, 72).");
      return false;
    }
    if (!Number.isFinite(height) || height < 120 || height > 230) {
      setErr("Укажи рост в см (например, 175).");
      return false;
    }
    setErr("");
    return true;
  };

  const next1 = () => {
    if (!validateStep1()) return;
    setStep(2);
  };
  const next2 = () => {
    if (!form.goal) {
      setErr("Выбери цель — один из вариантов выше.");
      return;
    }
    if (form.goal === "custom" && !(form.goal_custom || "").trim()) {
      setErr("Кратко опиши свою цель в поле ниже.");
      return;
    }
    setErr("");
    setStep(3);
  };
  const next3 = () => {
    if (!form.budget) {
      setErr("Выбери вариант бюджета.");
      return;
    }
    if (form.budget === "custom") {
      const v = parseFloat(String(form.budget_custom).replace(",", "."));
      if (!Number.isFinite(v) || v <= 0) {
        setErr("Введи сумму в ₽ за неделю.");
        return;
      }
    }
    setErr("");
    setStep(4);
  };

  const back2 = () => {
    setErr("");
    setStep(1);
  };
  const back3 = () => {
    setErr("");
    setStep(2);
  };
  const back4 = () => {
    setErr("");
    setStep(3);
  };

  const finish = async () => {
    await save(form);
  };

  const progressPct = (step / TOTAL) * 100;

  return (
    <div className="modal-backdrop onboarding-backdrop">
      <div className="modal-dialog onboarding-dialog">
        <header className="onboarding-header">
          <div className="onboarding-header-row">
            {mode === "edit" ? (
              <span className="onboarding-brand">Профиль</span>
            ) : (
              <span className="onboarding-brand">Настройка</span>
            )}
            {mode === "edit" && onCancel && (
              <button type="button" className="onboarding-icon-close" onClick={onCancel} aria-label="Закрыть">
                ×
              </button>
            )}
          </div>
          <div className="onboarding-progress-outer" aria-hidden>
            <div className="onboarding-progress-inner" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="onboarding-step-meta">
            Шаг {step} из {TOTAL}
          </p>
          <h1 className="onboarding-heading">{STEP_HEADINGS[step - 1]}</h1>
        </header>

        <div className="modal-body onboarding-body">
          {err && <div className="onboarding-error">{err}</div>}

          {step === 1 && <OnboardingStep1 value={form} onChange={setForm} />}
          {step === 2 && <OnboardingStep2 value={form} onChange={setForm} />}
          {step === 3 && <OnboardingStep3 value={form} onChange={setForm} />}
          {step === 4 && <OnboardingStep4 value={form} onChange={setForm} />}
        </div>

        <footer className="onboarding-footer">
          <div className="onboarding-actions">
            {step === 1 ? (
              <>
                <div className="onboarding-cta-half" aria-hidden />
                <button type="button" className="pill-btn pill-btn-primary onboarding-cta-half" onClick={next1}>
                  Далее
                </button>
              </>
            ) : step <= 3 ? (
              <>
                <button type="button" className="pill-btn pill-btn-ghost onboarding-cta-half" onClick={step === 2 ? back2 : back3}>
                  Назад
                </button>
                <button type="button" className="pill-btn pill-btn-primary onboarding-cta-half" onClick={step === 2 ? next2 : next3}>
                  Далее
                </button>
              </>
            ) : (
              <>
                <button type="button" className="pill-btn pill-btn-ghost onboarding-cta-half" onClick={back4} disabled={saving}>
                  Назад
                </button>
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
