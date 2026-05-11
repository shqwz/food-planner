import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost } from "../api/client";
import { IconCloseSmall, IconSearch } from "../components/ui-icons";

const UNIT_OPTIONS = ["г", "мл", "шт", "кг"];

function AddPantryModal({ userId, onClose, onAdded }) {
  const [name, setName] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState("г");
  const [price, setPrice] = useState("");
  const [expiry, setExpiry] = useState("");
  const [saving, setSaving] = useState(false);
  const [searchTimer, setSearchTimer] = useState(null);

  const onNameChange = (val) => {
    setName(val);
    if (searchTimer) clearTimeout(searchTimer);
    if (val.trim().length < 2) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      try {
        const data = await apiGet("/api/products/search", { q: val });
        setSuggestions(data || []);
      } catch { setSuggestions([]); }
    }, 300);
    setSearchTimer(t);
  };

  const pickSuggestion = (s) => {
    setName(s.name);
    setUnit(s.unit || "г");
    setSuggestions([]);
  };

  const submit = async () => {
    const a = parseFloat(String(amount).replace(",", "."));
    const p = parseFloat(String(price).replace(",", "."));
    if (!name.trim() || !(a > 0)) return;
    setSaving(true);
    try {
      await apiPost("/api/pantry", {
        user_id: userId,
        name: name.trim(),
        amount: a,
        unit,
        price_per_unit: Number.isFinite(p) && p >= 0 ? p : 0,
        expiry_date: expiry || null,
      });
      onAdded();
      onClose();
    } catch (e) {
      alert(e.message || "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-dialog" role="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-head-text"><h2 className="modal-title">Добавить в кладовую</h2></div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Закрыть">×</button>
        </div>
        <div className="modal-body">
          <div className="modal-stack">
            <div className="field-group">
              <label className="field-label" htmlFor="pantry-name">Название</label>
              <input
                id="pantry-name"
                className="form-text-input"
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="Например, куриная грудка"
                autoComplete="off"
              />
              {suggestions.length > 0 && (
                <div style={{ background: "var(--c-surface2)", borderRadius: 8, marginTop: 4, overflow: "hidden" }}>
                  {suggestions.map((s) => (
                    <div
                      key={s.id}
                      style={{ padding: "8px 12px", cursor: "pointer", fontSize: 14 }}
                      onClick={() => pickSuggestion(s)}
                    >
                      {s.name} <span style={{ color: "var(--c-text-secondary)" }}>({s.unit})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <div className="field-group" style={{ flex: 1 }}>
                <label className="field-label" htmlFor="pantry-amount">Количество</label>
                <input id="pantry-amount" className="form-text-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="field-group" style={{ width: 110 }}>
                <label className="field-label" htmlFor="pantry-unit">Единица</label>
                <div className="modal-select-wrap">
                  <select id="pantry-unit" className="modal-select" value={unit} onChange={(e) => setUnit(e.target.value)}>
                    {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="pantry-price">Цена за ед. (₽, необязательно)</label>
              <input id="pantry-price" className="form-text-input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Оставьте пустым" />
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="pantry-expiry">Срок годности (необязательно)</label>
              <input id="pantry-expiry" className="form-text-input" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
            </div>
            <button type="button" className="pill-btn pill-btn-primary modal-stack-submit" onClick={submit} disabled={saving || !name.trim() || !amount}>
              {saving ? "Сохраняем…" : "Добавить"}
            </button>
            <button type="button" className="pill-btn pill-btn-ghost modal-stack-secondary" onClick={onClose}>Отмена</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Ориентиры «низкий запас» по типу единицы (без единого числа вроде 200 для всех позиций). */
const LOW_STOCK_GRAMS = 150;
const LOW_STOCK_ML = 200;
const LOW_STOCK_PIECES = 3;

/**
 * @returns {null | { label: string, title: string }} — бейдж только если нужно привлечь внимание
 */
function pantryLowStockBadge(amount, rawUnit) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) {
    return {
      label: "Пусто",
      title: "Остаток нулевой или не указан — позиция не учитывается в запасе.",
    };
  }

  const u = String(rawUnit || "г")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");

  const isMassG =
    u === "г" || u === "гр" || u === "грамм" || u === "граммов" || u === "g" || u === "г." || u === "гр.";
  const isMassKg = u === "кг" || u === "kg";
  const isMl = u === "мл" || u === "ml";
  const isL = u === "л" || u === "l";
  const isPieces =
    u === "шт" ||
    u === "штук" ||
    u === "штука" ||
    u === "pcs" ||
    u === "pc" ||
    u.startsWith("шт");

  let comparable = null;
  let unitHint = "";

  if (isMassG) {
    comparable = n;
    unitHint = `${LOW_STOCK_GRAMS} г`;
  } else if (isMassKg) {
    comparable = n * 1000;
    unitHint = `${LOW_STOCK_GRAMS} г`;
  } else if (isMl) {
    comparable = n;
    unitHint = `${LOW_STOCK_ML} мл`;
  } else if (isL) {
    comparable = n * 1000;
    unitHint = `${LOW_STOCK_ML} мл`;
  } else if (isPieces) {
    if (n < LOW_STOCK_PIECES) {
      return {
        label: "Мало",
        title: `Меньше ${LOW_STOCK_PIECES} шт. — при необходимости пополните запас.`,
      };
    }
    return null;
  } else {
    return null;
  }

  if (comparable == null) return null;

  const limit =
    isMassG || isMassKg ? LOW_STOCK_GRAMS : LOW_STOCK_ML;
  if (comparable < limit) {
    return {
      label: "Мало",
      title: `Ориентировочно низкий остаток: меньше ${unitHint}. Точный порог подстраивается под единицу товара (не персонально под ваш рацион).`,
    };
  }

  return null;
}

export default function PantryTab({ showToast, userId }) {
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState("");
  const [addModal, setAddModal] = useState(false);

  const loadPantry = useCallback(async (opts) => {
    const soft = opts?.soft === true;
    if (userId == null || userId === "") {
      setProducts([]);
      setLoading(false);
      return;
    }
    try {
      if (!soft) setLoading(true);
      setError("");
      const data = await apiGet("/api/pantry", { user_id: userId });
      setProducts(data);
    } catch (e) {
      setError(e.message);
    } finally {
      if (!soft) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadPantry();
  }, [loadPantry]);

  const clearPantry = async () => {
    if (userId == null || userId === "" || products.length === 0) return;
    if (
      !window.confirm(
        "Удалить все позиции из кладовой? Резервы под план для этого аккаунта тоже сбросятся. Действие нельзя отменить.",
      )
    ) {
      return;
    }
    setClearing(true);
    try {
      await apiDelete("/api/pantry", { user_id: userId });
      await loadPantry({ soft: true });
      showToast("Кладовая очищена", "success");
    } catch (e) {
      showToast(e.message || "Ошибка", "error");
    } finally {
      setClearing(false);
    }
  };

  const filtered = useMemo(
    () => products.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())),
    [products, query]
  );

  if (loading) return <div className="content"><div className="card" style={{ padding: 16 }}>Загружаем кладовую...</div></div>;

  return (
    <div className="content">
      <div className="section-title">Запасы на сегодня</div>
      <div className="card" style={{ padding: 10, display: "flex", gap: 10, alignItems: "center" }}>
        <span className="pantry-search-icon" aria-hidden>
          <IconSearch size={18} />
        </span>
        <input
          type="text"
          placeholder="Поиск продуктов..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--c-text-primary)" }}
        />
        {query && (
          <button
            type="button"
            className="icon-btn icon-btn--svg"
            onClick={() => setQuery("")}
            aria-label="Очистить поиск"
            style={{ width: 32, height: 32, flexShrink: 0 }}
          >
            <IconCloseSmall size={16} />
          </button>
        )}
      </div>

      {error && (
        <div className="card" style={{ padding: 12, color: "var(--c-danger)" }}>
          {error}
        </div>
      )}
      {products.length === 0 ? (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 700 }}>Кладовая пуста</div>
          <div className="muted">Добавьте продукты, когда появится возможность.</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 700 }}>Ничего не найдено</div>
          <div className="muted">Попробуйте изменить запрос.</div>
        </div>
      ) : (
        <div className="card">
          {filtered.map((p) => {
            const stockBadge = pantryLowStockBadge(p.amount, p.unit);
            return (
              <div key={p.id} className="list-item">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, lineHeight: 1.35 }}>
                    {p.name}
                    <span style={{ fontWeight: 500, color: "var(--c-text-secondary)" }}>
                      {" "}
                      ·{" "}
                      {Number(p.amount) % 1 === 0 ? Math.round(Number(p.amount)) : p.amount}
                      &nbsp;{p.unit}
                    </span>
                  </div>
                </div>
                {stockBadge ? (
                  <span
                    className={`badge${stockBadge.label === "Пусто" ? " badge--empty" : " badge--warn"}`}
                    title={stockBadge.title}
                  >
                    {stockBadge.label}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
        <button
          type="button"
          className="pill-btn pill-btn-ghost"
          onClick={() => setAddModal(true)}
        >
          Добавить продукт
        </button>
        {products.length > 0 && (
          <button
            type="button"
            className="pill-btn pill-btn-ghost"
            disabled={clearing || loading}
            onClick={clearPantry}
            style={{ color: "var(--c-danger)" }}
          >
            Очистить кладовую
          </button>
        )}
      </div>

      {addModal && (
        <AddPantryModal
          userId={userId}
          onClose={() => setAddModal(false)}
          onAdded={() => loadPantry({ soft: true })}
        />
      )}
    </div>
  );
}
