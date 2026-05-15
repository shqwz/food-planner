import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost } from "../api/client";
import { IconCloseSmall, IconSearch } from "../components/ui-icons";
import StockEmptyGlyph from "../components/StockEmptyGlyph";

const UNIT_OPTIONS = ["г", "мл", "шт", "кг"];

/** Подпись поля цены: в БД хранится ₽/кг, ₽/л или ₽/шт в зависимости от единицы количества. */
function pantryPriceLabel(unit) {
  switch (unit) {
    case "шт":
      return "Цена за ед. (₽)";
    case "мл":
      return "Цена за л (₽)";
    case "г":
    case "кг":
      return "Цена за кг (₽)";
    default:
      return "Цена (₽)";
  }
}

function AddPantryModal({ userId, onClose, onAdded }) {
  const [name, setName] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState("г");
  const [price, setPrice] = useState("");
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

  const priceLabel = pantryPriceLabel(unit);

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
          <div className="modal-head-text"><h2 className="modal-title">Добавить</h2></div>
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
              <label className="field-label" htmlFor="pantry-price">{priceLabel}</label>
              <input id="pantry-price" className="form-text-input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Необязательно" />
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
      title: `Ориентировочно низкий остаток: меньше ${unitHint}.`,
    };
  }

  return null;
}

export default function PantryTab({ showToast, userId, embedded = false }) {
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
        "Удалить все позиции? Резервы под план тоже сбросятся.",
      )
    ) {
      return;
    }
    setClearing(true);
    try {
      await apiDelete("/api/pantry", { user_id: userId });
      await loadPantry({ soft: true });
      showToast("Очищено", "success");
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

  const rootClass = embedded ? "content content--stock-pane" : "content";

  if (loading) {
    return (
      <div className={rootClass}>
        <div className="stock-skeleton card" aria-busy="true" />
      </div>
    );
  }

  return (
    <div className={rootClass}>
      {!embedded && <div className="section-title">Запасы на сегодня</div>}

      <div className="stock-search card">
        <span className="pantry-search-icon" aria-hidden>
          <IconSearch size={18} />
        </span>
        <input
          type="text"
          className="stock-search__input"
          placeholder={embedded ? "Поиск" : "Поиск продуктов…"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
        {query ? (
          <button type="button" className="stock-search__clear" onClick={() => setQuery("")} aria-label="Очистить">
            <IconCloseSmall size={16} />
          </button>
        ) : null}
        {embedded ? (
          <button type="button" className="stock-search__add" onClick={() => setAddModal(true)} aria-label="Добавить">
            +
          </button>
        ) : null}
      </div>

      {error && <div className="card stock-error">{error}</div>}

      {products.length === 0 ? (
        <div className="card stock-empty">
          <StockEmptyGlyph variant="pantry" />
          <p className="stock-empty__title">Пока пусто</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card stock-empty">
          <StockEmptyGlyph variant="search" />
          <p className="stock-empty__title">Нет совпадений</p>
        </div>
      ) : (
        <div className="card stock-list">
          {filtered.map((p) => {
            const stockBadge = pantryLowStockBadge(p.amount, p.unit);
            return (
              <div key={p.id} className="list-item stock-list__row">
                <div className="stock-list__main">
                  <span className="stock-list__name">{p.name}</span>
                  <span className="stock-list__qty">
                    {Number(p.amount) % 1 === 0 ? Math.round(Number(p.amount)) : p.amount}
                    {" "}
                    {p.unit}
                  </span>
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

      {!embedded && (
        <div className="stock-actions">
          <button type="button" className="pill-btn pill-btn-ghost" onClick={() => setAddModal(true)}>
            Добавить
          </button>
        </div>
      )}

      {products.length > 0 && (
        <button
          type="button"
          className="stock-clear-link"
          disabled={clearing}
          onClick={clearPantry}
        >
          Очистить всё
        </button>
      )}

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
