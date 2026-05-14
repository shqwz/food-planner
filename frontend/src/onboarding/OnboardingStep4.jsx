function timeToMinutes(t) {
  const [h, m] = (t || "00:00").split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(mins) {
  const h = Math.floor(((mins % 1440) + 1440) % 1440 / 60);
  const m = ((mins % 1440) + 1440) % 1440 % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function sleepDuration(wake, sleep) {
  const wm = timeToMinutes(wake);
  const sm = timeToMinutes(sleep);
  let diff = wm - sm;
  if (diff < 0) diff += 1440;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m > 0 ? `${h}ч ${m}м` : `${h}ч`;
}

export default function OnboardingStep4({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  const wake = value.wake_time || "08:00";
  const sleep = value.sleep_time || "23:00";
  const duration = sleepDuration(wake, sleep);

  return (
    <div className="modal-stack onboarding-step-inner">
      <p className="onboarding-lead">
        AI расставит приёмы пищи по твоему расписанию — завтрак после подъёма, ужин до сна.
      </p>

      <div className="field-group">
        <div className="field-label">Время подъёма</div>
        <div className="onboarding-time-row">
          {["06:00","06:30","07:00","07:30","08:00","08:30","09:00","09:30","10:00","10:30","11:00"].map((t) => (
            <button
              key={t}
              type="button"
              className={`onboarding-time-chip${wake === t ? " onboarding-time-chip--active" : ""}`}
              onClick={() => set("wake_time", t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="onboarding-time-custom-wrap">
          <label className="onboarding-time-custom-label">Другое время:</label>
          <input
            type="time"
            className="onboarding-time-input"
            value={wake}
            onChange={(e) => set("wake_time", e.target.value)}
          />
        </div>
      </div>

      <div className="field-group">
        <div className="field-label">Время отхода ко сну</div>
        <div className="onboarding-time-row">
          {["21:00","21:30","22:00","22:30","23:00","23:30","00:00","00:30","01:00"].map((t) => (
            <button
              key={t}
              type="button"
              className={`onboarding-time-chip${sleep === t ? " onboarding-time-chip--active" : ""}`}
              onClick={() => set("sleep_time", t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="onboarding-time-custom-wrap">
          <label className="onboarding-time-custom-label">Другое время:</label>
          <input
            type="time"
            className="onboarding-time-input"
            value={sleep}
            onChange={(e) => set("sleep_time", e.target.value)}
          />
        </div>
      </div>

      <div className="onboarding-sleep-summary">
        Сон: <strong>{duration}</strong>
        {timeToMinutes(wake) - timeToMinutes(sleep) < 420 && timeToMinutes(wake) - timeToMinutes(sleep) > -1020
          ? " — маловато, рекомендуется 7–9 часов"
          : ""}
      </div>
    </div>
  );
}
