import { useEffect, useRef, useState } from "react";
import { disableTelegramVerticalSwipes } from "../lib/telegram";

export const DRUM_ITEM_H = 40;

function wrapIndex(i, n) {
  if (!n) return 0;
  return ((Math.round(i) % n) + n) % n;
}

/**
 * Барабан выбора (drag). Значение родителю — только после отпускания,
 * чтобы на телефоне не перерисовывать весь экран на каждый touchmove.
 */
export default function DrumPicker({ items, value, onChange, width = 72, circular = true }) {
  const innerRef = useRef(null);
  const dragRef = useRef(null);
  const draggingRef = useRef(false);
  const [dragIdx, setDragIdx] = useState(null);

  const idx = items.indexOf(value);
  const selIdx = idx === -1 ? 0 : idx;
  const displayIdx = dragIdx ?? selIdx;
  const n = items.length;
  const totalRows = circular && n > 0 ? n * 2 : n;

  const yForVirtual = (virtualRow) => (2 - virtualRow) * DRUM_ITEM_H;
  const stableVirtualRow = (canonicalIdx) => n + canonicalIdx;

  function recenterCircularTranslate(rawY, el) {
    if (!circular || n <= 0 || !el) return rawY;
    let newY = rawY;
    let vr = Math.round(2 - newY / DRUM_ITEM_H);
    while (vr < n) {
      newY += n * DRUM_ITEM_H;
      vr = Math.round(2 - newY / DRUM_ITEM_H);
    }
    while (vr >= 2 * n) {
      newY -= n * DRUM_ITEM_H;
      vr = Math.round(2 - newY / DRUM_ITEM_H);
    }
    el.style.transition = "none";
    el.style.transform = `translateY(${newY}px)`;
    return newY;
  }

  function applyTranslate(canonicalIndex) {
    const el = innerRef.current;
    if (!el) return;
    el.style.transition = "none";
    const y =
      circular && n > 0
        ? yForVirtual(stableVirtualRow(canonicalIndex))
        : yForVirtual(canonicalIndex);
    el.style.transform = `translateY(${y}px)`;
  }

  useEffect(() => {
    if (draggingRef.current) return;
    applyTranslate(selIdx);
  }, [value, selIdx, circular, n]);

  function currentY() {
    const el = innerRef.current;
    const t = el?.style.transform;
    const m = t?.match(/translateY\(([-\d.]+)px\)/);
    if (m) return parseFloat(m[1]);
    if (!el) return 0;
    return circular && n > 0
      ? yForVirtual(stableVirtualRow(selIdx))
      : yForVirtual(selIdx);
  }

  function snapToNearest(rawY) {
    const live = 2 - rawY / DRUM_ITEM_H;
    const picked =
      circular && n > 0
        ? wrapIndex(live, n)
        : Math.max(0, Math.min(n - 1, Math.round(live)));
    const el = innerRef.current;
    if (!el) return;
    el.style.transition = "transform 0.18s ease";
    const targetY =
      circular && n > 0 ? yForVirtual(stableVirtualRow(picked)) : yForVirtual(picked);
    el.style.transform = `translateY(${targetY}px)`;
    if (items[picked] !== value) {
      onChange(items[picked]);
    }
  }

  function onPointerDown(e) {
    e.preventDefault();
    disableTelegramVerticalSwipes();
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    dragRef.current = {
      initialClientY: e.clientY,
      initialTranslateY: currentY(),
    };
    setDragIdx(selIdx);
    const el = innerRef.current;
    if (el) el.style.transition = "none";
  }

  function onPointerMove(e) {
    if (!dragRef.current || !innerRef.current) return;
    e.preventDefault();
    const dy = e.clientY - dragRef.current.initialClientY;
    let newY = dragRef.current.initialTranslateY + dy;
    const el = innerRef.current;
    if (circular && n > 0) {
      newY = recenterCircularTranslate(newY, el);
    } else {
      el.style.transition = "none";
      el.style.transform = `translateY(${newY}px)`;
    }
    const live = 2 - newY / DRUM_ITEM_H;
    const liveIdx =
      circular && n > 0
        ? wrapIndex(live, n)
        : Math.max(0, Math.min(n - 1, Math.round(live)));
    setDragIdx(liveIdx);
  }

  function endDrag(e) {
    if (!dragRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    snapToNearest(currentY());
    dragRef.current = null;
    draggingRef.current = false;
    setDragIdx(null);
  }

  return (
    <div
      className="drum-picker"

      style={{ width }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div
        ref={innerRef}
        className="drum-picker__inner"
        style={{ willChange: dragIdx != null ? "transform" : undefined }}
      >
        {Array.from({ length: totalRows }, (_, r) => {
          const canonicalIdx = n > 0 ? ((r % n) + n) % n : 0;
          const item = items[canonicalIdx];
          const highlighted = canonicalIdx === displayIdx;
          return (
            <div
              key={`r-${r}`}
              className={`drum-picker__row${highlighted ? " drum-picker__row--active" : ""}`}
            >
              {item}
            </div>
          );
        })}
      </div>
      <div className="drum-picker__fade drum-picker__fade--top" aria-hidden />
      <div className="drum-picker__fade drum-picker__fade--bottom" aria-hidden />
      <div className="drum-picker__line drum-picker__line--top" aria-hidden />
      <div className="drum-picker__line drum-picker__line--bottom" aria-hidden />
    </div>
  );
}
