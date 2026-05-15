import DrumPicker from "./DrumPicker";

const HOURS24 = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

function parseTime(t) {
  const [h, m] = (t || "00:00").split(":").map((x) => parseInt(x, 10));
  return {
    h: Number.isFinite(h) ? Math.min(23, Math.max(0, h)) : 0,
    m: Number.isFinite(m) ? Math.min(59, Math.max(0, m)) : 0,
  };
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Выбор времени ЧЧ:ММ — те же барабаны, что в профиле (сон). */
export default function TimeDrumPicker({ value, onChange, labelledBy }) {
  const { h, m } = parseTime(value);

  return (
    <div className="time-drum-picker" role="group" aria-labelledby={labelledBy}>
      <DrumPicker
        items={HOURS24}
        value={pad2(h)}
        onChange={(hh) => onChange(`${hh}:${pad2(m)}`)}
        width={64}
      />
      <span className="time-drum-picker__sep" aria-hidden>
        :
      </span>
      <DrumPicker
        items={MINS}
        value={pad2(m)}
        onChange={(mm) => onChange(`${pad2(h)}:${mm}`)}
        width={64}
      />
    </div>
  );
}
