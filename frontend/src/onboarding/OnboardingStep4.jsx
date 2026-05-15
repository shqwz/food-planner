import TimeDrumPicker from "../components/TimeDrumPicker";

function timeToMinutes(t) {
  const [h, m] = (t || "00:00").split(":").map(Number);
  return h * 60 + m;
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
      <div className="field-group">
        <div className="field-label" id="ob-wake-time-label">
          Время подъёма
        </div>
        <TimeDrumPicker
          value={wake}
          onChange={(t) => set("wake_time", t)}
          labelledBy="ob-wake-time-label"
        />
      </div>

      <div className="field-group">
        <div className="field-label" id="ob-sleep-time-label">
          Время отхода ко сну
        </div>
        <TimeDrumPicker
          value={sleep}
          onChange={(t) => set("sleep_time", t)}
          labelledBy="ob-sleep-time-label"
        />
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
