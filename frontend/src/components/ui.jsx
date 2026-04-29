/* ─── Card ────────────────────────────────────────────────── */
export function Card({ children, className = "", style = {}, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl mb-3 transition-transform active:scale-[0.98] ${className}`}
      style={{
        background: "var(--tg-surface)",
        border: "1px solid var(--tg-border)",
        padding: "16px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ─── GlassCard ──────────────────────────────────────────── */
export function GlassCard({ children, className = "", style = {} }) {
  return (
    <div
      className={`rounded-2xl mb-3 ${className}`}
      style={{
        background: "rgba(255,255,255,0.04)",
        backdropFilter: "blur(12px)",
        border: "1px solid var(--tg-border)",
        padding: "16px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ─── ProgressBar ────────────────────────────────────────── */
export function ProgressBar({ value, max, color = "var(--tg-accent)" }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="h-[6px] rounded-full overflow-hidden mt-2" style={{ background: "rgba(255,255,255,0.08)" }}>
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

/* ─── ProgressRing ────────────────────────────────────────── */
export function ProgressRing({ value, max, size = 60, stroke = 7, color = "var(--tg-accent)", label, sub }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(1, value / max);
  const offset = circ * (1 - pct);
  const id = `grad-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative flex items-center justify-center">
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)" }}
          />
        </svg>
        {sub && (
          <div className="absolute text-center">
            <div className="text-[11px] font-extrabold leading-tight" style={{ color }}>{sub}</div>
          </div>
        )}
      </div>
      {label && <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--tg-muted)" }}>{label}</span>}
    </div>
  );
}

/* ─── BigCaloriesRing ────────────────────────────────────── */
export function BigCaloriesRing({ eaten, goal }) {
  const size = 140;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(1, eaten / goal);
  const offset = circ * (1 - pct);
  return (
    <div className="relative flex items-center justify-center">
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <defs>
          <linearGradient id="calGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#6c63ff" />
            <stop offset="100%" stopColor="#00d9a3" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="url(#calGrad)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)" }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-[28px] font-extrabold leading-none" style={{ color: "var(--tg-text)" }}>{eaten}</div>
        <div className="text-[11px] font-semibold mt-0.5" style={{ color: "var(--tg-muted)" }}>из {goal} ккал</div>
      </div>
    </div>
  );
}

/* ─── Skeleton ───────────────────────────────────────────── */
export function Skeleton({ h = "70px", className = "" }) {
  return (
    <div
      className={`rounded-2xl mb-2 ${className}`}
      style={{
        height: h,
        background: "linear-gradient(90deg, var(--tg-surface) 25%, var(--tg-surface2) 50%, var(--tg-surface) 75%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.4s infinite",
      }}
    />
  );
}

export function SkeletonList({ count = 4 }) {
  return <>{Array.from({ length: count }).map((_, i) => <Skeleton key={i} h="72px" />)}</>;
}

/* ─── EmptyState ─────────────────────────────────────────── */
export function EmptyState({ icon = "🫙", title = "Пусто", desc = "", action, actionLabel = "Добавить" }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="text-[56px] mb-4" style={{ filter: "grayscale(20%)" }}>{icon}</div>
      <div className="text-[18px] font-extrabold mb-2" style={{ color: "var(--tg-text)" }}>{title}</div>
      {desc && <div className="text-[14px] leading-relaxed mb-5" style={{ color: "var(--tg-muted)", maxWidth: 240 }}>{desc}</div>}
      {action && (
        <button className="pill-btn btn-primary" onClick={action}>{actionLabel}</button>
      )}
    </div>
  );
}

/* ─── PillButton ─────────────────────────────────────────── */
export function PillButton({ children, onClick, variant = "primary", className = "" }) {
  const styles =
    variant === "primary"
      ? {
          background: "linear-gradient(135deg, #6c63ff, #9b59b6)",
          color: "#fff",
          boxShadow: "0 4px 16px rgba(108,99,255,0.35)",
        }
      : {
          background: "rgba(255,255,255,0.04)",
          color: "var(--tg-text)",
          border: "1px solid var(--tg-border)",
        };
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-center gap-2 py-3 rounded-[14px] text-[14px] font-bold mt-2 transition-all active:scale-95 border-none cursor-pointer ${className}`}
      style={styles}
    >
      {children}
    </button>
  );
}

/* ─── SectionTitle ───────────────────────────────────────── */
export function SectionTitle({ children }) {
  return (
    <div className="text-[12px] font-extrabold uppercase tracking-widest mt-5 mb-2.5"
      style={{ color: "var(--tg-muted)", letterSpacing: "0.8px" }}>
      {children}
    </div>
  );
}

/* ─── MacroChip ──────────────────────────────────────────── */
export function MacroChip({ label, value, color }) {
  return (
    <div
      className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-bold whitespace-nowrap flex-shrink-0"
      style={{
        background: `${color}18`,
        border: `1px solid ${color}30`,
        color,
      }}
    >
      {label} {value}
    </div>
  );
}

/* ─── Toast ──────────────────────────────────────────────── */
export default function Toast({ icon, text }) {
  return (
    <div
      className="fixed bottom-[90px] left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2.5 rounded-xl whitespace-nowrap text-[13px] font-bold z-[200] animate-pop-in"
      style={{
        background: "var(--tg-surface2)",
        border: "1px solid var(--tg-border)",
        color: "var(--tg-text)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      }}
    >
      <span>{icon}</span>
      <span>{text}</span>
    </div>
  );
}
