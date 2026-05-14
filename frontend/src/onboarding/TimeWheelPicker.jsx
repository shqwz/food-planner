import { useRef, useLayoutEffect, useCallback, useEffect } from "react";

const ITEM_H = 40;
const VISIBLE_ROWS = 5;
const WHEEL_H = ITEM_H * VISIBLE_ROWS;
const SPACER = (WHEEL_H - ITEM_H) / 2;

/** Полных «кругов» с каждой стороны от центрального диапазона (можно крутить далеко в обе стороны). */
const CYCLES_SIDE = 5;
const HOUR_CYCLE = 24;
const MIN_CYCLE = 60;
const HOUR_ROWS = (CYCLES_SIDE * 2 + 1) * HOUR_CYCLE;
const MIN_ROWS = (CYCLES_SIDE * 2 + 1) * MIN_CYCLE;
const HOUR_CENTER_OFFSET = CYCLES_SIDE * HOUR_CYCLE;
const MIN_CENTER_OFFSET = CYCLES_SIDE * MIN_CYCLE;

function pad2(n) {
  return String(n).padStart(2, "0");
}

function parseTime(t) {
  const [h, m] = (t || "00:00").split(":").map((x) => parseInt(x, 10));
  return {
    h: Number.isFinite(h) ? Math.min(23, Math.max(0, h)) : 0,
    m: Number.isFinite(m) ? Math.min(59, Math.max(0, m)) : 0,
  };
}

function readRow(ref, totalRows) {
  const el = ref.current;
  if (!el) return 0;
  const raw = Math.round((el.scrollTop - SPACER) / ITEM_H);
  return Math.min(totalRows - 1, Math.max(0, raw));
}

function scrollToCenterRow(ref, centerRow) {
  const el = ref.current;
  if (!el) return;
  el.scrollTop = SPACER + centerRow * ITEM_H;
}

function normalizeHourScroll(ref) {
  const el = ref.current;
  if (!el) return 0;
  const row = readRow(ref, HOUR_ROWS);
  const logical = ((row % HOUR_CYCLE) + HOUR_CYCLE) % HOUR_CYCLE;
  const centerRow = HOUR_CENTER_OFFSET + logical;
  el.scrollTop = SPACER + centerRow * ITEM_H;
  return logical;
}

function normalizeMinScroll(ref) {
  const el = ref.current;
  if (!el) return 0;
  const row = readRow(ref, MIN_ROWS);
  const logical = ((row % MIN_CYCLE) + MIN_CYCLE) % MIN_CYCLE;
  const centerRow = MIN_CENTER_OFFSET + logical;
  el.scrollTop = SPACER + centerRow * ITEM_H;
  return logical;
}

export default function TimeWheelPicker({ value, onChange, labelledBy }) {
  const hourRef = useRef(null);
  const minRef = useRef(null);
  const committedRef = useRef(null);
  const timerRef = useRef(null);

  const syncScrollFromValue = useCallback((t) => {
    const { h, m } = parseTime(t);
    scrollToCenterRow(hourRef, HOUR_CENTER_OFFSET + h);
    scrollToCenterRow(minRef, MIN_CENTER_OFFSET + m);
  }, []);

  useLayoutEffect(() => {
    if (committedRef.current === null) {
      committedRef.current = value;
      syncScrollFromValue(value);
      return;
    }
    if (value !== committedRef.current) {
      committedRef.current = value;
      syncScrollFromValue(value);
    }
  }, [value, syncScrollFromValue]);

  const emitSettled = useCallback(() => {
    const hi = normalizeHourScroll(hourRef);
    const mi = normalizeMinScroll(minRef);
    const next = `${pad2(hi)}:${pad2(mi)}`;
    if (next !== committedRef.current) {
      committedRef.current = next;
      onChange(next);
    }
  }, [onChange]);

  const scheduleSettle = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      emitSettled();
    }, 180);
  }, [emitSettled]);

  useEffect(() => {
    const hEl = hourRef.current;
    const mEl = minRef.current;
    if (!hEl || !mEl) return undefined;

    hEl.addEventListener("scroll", scheduleSettle, { passive: true });
    mEl.addEventListener("scroll", scheduleSettle, { passive: true });

    return () => {
      hEl.removeEventListener("scroll", scheduleSettle);
      mEl.removeEventListener("scroll", scheduleSettle);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [scheduleSettle]);

  return (
    <div
      className="ios-time-wheel"
      role="group"
      aria-labelledby={labelledBy}
    >
      <div className="ios-time-wheel-window" style={{ height: WHEEL_H }}>
        <div className="ios-time-wheel-slot" aria-hidden />
        <div className="ios-time-wheel-fade ios-time-wheel-fade--top" aria-hidden />
        <div className="ios-time-wheel-fade ios-time-wheel-fade--bottom" aria-hidden />
        <div className="ios-time-wheel-cols">
          <div ref={hourRef} className="ios-time-wheel-col">
            <div className="ios-time-wheel-spacer" style={{ height: SPACER }} aria-hidden />
            {Array.from({ length: HOUR_ROWS }, (_, i) => (
              <div
                key={`h-${i}`}
                className="ios-time-wheel-item"
                role="presentation"
                onClick={() => {
                  scrollToCenterRow(hourRef, i);
                  window.requestAnimationFrame(() => emitSettled());
                }}
              >
                {pad2(i % HOUR_CYCLE)}
              </div>
            ))}
            <div className="ios-time-wheel-spacer" style={{ height: SPACER }} aria-hidden />
          </div>
          <span className="ios-time-wheel-sep" aria-hidden>
            :
          </span>
          <div ref={minRef} className="ios-time-wheel-col">
            <div className="ios-time-wheel-spacer" style={{ height: SPACER }} aria-hidden />
            {Array.from({ length: MIN_ROWS }, (_, i) => (
              <div
                key={`m-${i}`}
                className="ios-time-wheel-item"
                role="presentation"
                onClick={() => {
                  scrollToCenterRow(minRef, i);
                  window.requestAnimationFrame(() => emitSettled());
                }}
              >
                {pad2(i % MIN_CYCLE)}
              </div>
            ))}
            <div className="ios-time-wheel-spacer" style={{ height: SPACER }} aria-hidden />
          </div>
        </div>
      </div>
    </div>
  );
}
