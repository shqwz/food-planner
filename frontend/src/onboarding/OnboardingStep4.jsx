import { useCallback, useState } from "react";

function newRow() {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, text: "" };
}

/** Одна пустая строка в конце; при заполнении последней — добавляется следующая пустая. */
function normalizeLines(rows) {
  let next = rows.map((r) => ({ ...r }));
  if (!next.length) return [newRow()];
  while (next.length > 1 && next[next.length - 1].text === "" && next[next.length - 2].text === "") {
    next.pop();
  }
  const last = next[next.length - 1];
  if (last.text.trim() !== "") {
    next = [...next, newRow()];
  }
  return next;
}

export default function OnboardingStep4({ value, onChange }) {
  const [lines, setLines] = useState(() => [newRow()]);

  const setLineText = useCallback((id, text) => {
    setLines((prev) => {
      const mapped = prev.map((row) => (row.id === id ? { ...row, text } : row));
      return normalizeLines(mapped);
    });
  }, []);

  const removeField = (id) => {
    setLines((prev) => {
      const filtered = prev.filter((row) => row.id !== id);
      if (!filtered.length) return [newRow()];
      return normalizeLines(filtered);
    });
  };

  const flushToList = () => {
    const toAdd = lines.map((row) => row.text.trim()).filter(Boolean);
    if (!toAdd.length) return;
    const list = [...(value.excluded_foods || [])];
    for (const t of toAdd) {
      if (!list.includes(t)) list.push(t);
    }
    onChange({ ...value, excluded_foods: list });
    setLines(normalizeLines([newRow()]));
  };

  const removeChip = (name) => {
    onChange({
      ...value,
      excluded_foods: (value.excluded_foods || []).filter((x) => x !== name),
    });
  };

  const onKeyDown = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    flushToList();
  };

  return (
    <div className="modal-stack onboarding-step-inner">
      <p className="onboarding-lead">
        Здесь — продукты и блюда, которые <strong>не должны попадать</strong> в автоматический план: аллергены,
        непереносимость, религиозные ограничения или просто то, что не ешь.
      </p>

      <div className="field-group">
        <div className="onboarding-exclusion-rows">
          {lines.map((row, idx) => {
            const isTrailingEmpty = idx === lines.length - 1 && !row.text.trim();
            const showRemove = lines.length > 1 && !isTrailingEmpty;
            return (
              <div key={row.id} className="onboarding-exclusion-row">
                <input
                  type="text"
                  className="onboarding-exclusion-input"
                  value={row.text}
                  onChange={(e) => setLineText(row.id, e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Название продукта или блюда"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="done"
                />
                {showRemove && (
                  <button
                    type="button"
                    className="onboarding-exclusion-row-remove"
                    aria-label="Убрать строку"
                    onClick={() => removeField(row.id)}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {(value.excluded_foods || []).length > 0 && (
        <div className="field-group">
          <div className="field-label">Уже в списке</div>
          <div className="onboarding-chip-wrap">
            {(value.excluded_foods || []).map((x) => (
              <span key={x} className="onboarding-chip">
                {x}
                <button
                  type="button"
                  className="onboarding-chip-remove"
                  aria-label={`Удалить ${x}`}
                  onClick={() => removeChip(x)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
