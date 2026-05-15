import { useLayoutEffect, useRef, useState } from "react";
import { disableTelegramVerticalSwipes } from "../lib/telegram";

export const DRUM_ITEM_H = 40;

/** Нечётное число копий списка: запас сверху и снизу + «рабочая» полоса по центру. */
const DRUM_CIRCULAR_COPIES = 9;

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
  const [centerRowIndex, setCenterRowIndex] = useState(0);

  const idx = items.indexOf(value);
  const selIdx = idx === -1 ? 0 : idx;
  const n = items.length;

  const midCopy = circular && n > 0 ? Math.floor(DRUM_CIRCULAR_COPIES / 2) : 0;
  /** Допустимый индекс физической строки у окна выбора, без перебора while на каждый move. */
  const vrLow = (midCopy - 1) * n;
  const vrHigh = (midCopy + 2) * n - 1;
  const totalRows = circular && n > 0 ? DRUM_CIRCULAR_COPIES * n : n;

  const yForVirtual = (virtualRow) => (2 - virtualRow) * DRUM_ITEM_H;

  function physicalRowAfterApply(canonicalIdx) {
    return circular && n > 0 ? midCopy * n + canonicalIdx : canonicalIdx;
  }

  /** O(1): удерживаем центр окна по физической строке в допустимом коридоре (не тысячи while). */
  function recenterCircularTranslate(rawY, el) {
    if (!circular || n <= 0 || !el) return rawY;
    const H = DRUM_ITEM_H;
    let Y = rawY;
    let vr = Math.round(2 - Y / H);
    if (vr < vrLow) {
      const hop = Math.ceil((vrLow - vr) / n);
      Y += hop * n * H;
    } else if (vr > vrHigh) {
      const hop = Math.ceil((vr - vrHigh) / n);
      Y -= hop * n * H;
    }
    vr = Math.round(2 - Y / H);
    if (vr < vrLow) Y += n * H;
    else if (vr > vrHigh) Y -= n * H;
    el.style.transition = "none";
    el.style.transform = `translateY(${Y}px)`;
    return Y;
  }

  useLayoutEffect(() => {
    if (draggingRef.current) return;
    const el = innerRef.current;
    if (!el) return;
    const vr =
      circular && n > 0 ? midCopy * n + selIdx : selIdx;
    el.style.transition = "none";
    el.style.transform = `translateY(${yForVirtual(vr)}px)`;
    setCenterRowIndex(Math.max(0, Math.min(totalRows - 1, vr)));
  }, [value, selIdx, circular, n, midCopy, totalRows]);

  function currentY() {
    const el = innerRef.current;
    const t = el?.style.transform;
    const m = t?.match(/translateY\(([-\d.]+)px\)/);
    if (m) return parseFloat(m[1]);
    if (!el) return 0;
    return yForVirtual(physicalRowAfterApply(selIdx));
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
    const targetRow = physicalRowAfterApply(picked);
    const targetY = yForVirtual(targetRow);
    el.style.transform = `translateY(${targetY}px)`;
    setCenterRowIndex(Math.max(0, Math.min(totalRows - 1, targetRow)));
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
    const cy = currentY();
    const cr = Math.max(0, Math.min(totalRows - 1, Math.round(2 - cy / DRUM_ITEM_H)));
    setCenterRowIndex(cr);
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
      const yMin = yForVirtual(Math.max(0, n - 1));
      const yMax = yForVirtual(0);
      newY = Math.max(yMin, Math.min(yMax, newY));
      el.style.transition = "none";
      el.style.transform = `translateY(${newY}px)`;
    }
    const vr = Math.max(0, Math.min(totalRows - 1, Math.round(2 - newY / DRUM_ITEM_H)));
    setCenterRowIndex(vr);
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
          const highlighted = r === centerRowIndex;
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
